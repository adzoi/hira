-- Security hardening (deep audit 2026-10-06, round 6).
--   A. job_applications / service_inquiries could be INSERTed already 'accepted'/'completed'
--      (skipping the other party's decision, unlocking reviews, hirer contact and job visibility).
--   B. completed_jobs could be inserted for any freelancer on the hirer's job, accepted or not.
--   C. completed_jobs was UNIQUE (job_id), so a multi-vacancy job could only complete one hire
--      (the second hire's review then failed against the first hire's row).

-- ── A. Insert-time state pinning ────────────────────────────────────────────
-- SECURITY INVOKER on purpose (see round 5): only client roles are constrained.
CREATE OR REPLACE FUNCTION public.job_applications_pin_insert_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_job record;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  NEW.status := 'pending';
  NEW.cancel_requested_by := NULL;
  NEW.deleted_by_hirer := false;
  NEW.deleted_by_freelancer := false;
  NEW.created_at := now();

  SELECT j.status, j.expires_at, j.application_deadline, hp.user_id AS hirer_user_id
  INTO v_job
  FROM public.jobs j
  JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
  WHERE j.id = NEW.job_id;

  IF NOT FOUND
     OR v_job.status <> 'open'
     OR (v_job.expires_at IS NOT NULL AND v_job.expires_at <= now())
     OR (v_job.application_deadline IS NOT NULL AND v_job.application_deadline < CURRENT_DATE) THEN
    RAISE EXCEPTION 'This job is not accepting applications' USING ERRCODE = '42501';
  END IF;

  IF v_job.hirer_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot apply to your own job' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_applications_pin_insert_state ON public.job_applications;
CREATE TRIGGER job_applications_pin_insert_state
  BEFORE INSERT ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.job_applications_pin_insert_state();

CREATE OR REPLACE FUNCTION public.service_inquiries_pin_insert_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_service record;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  NEW.status := 'pending';
  NEW.completed_at := NULL;
  NEW.cancel_requested_by := NULL;
  NEW.deleted_by_hirer := false;
  NEW.deleted_by_freelancer := false;
  NEW.created_at := now();
  NEW.updated_at := now();

  IF NEW.service_id IS NOT NULL THEN
    SELECT s.freelancer_profile_id, s.is_active
    INTO v_service
    FROM public.services s
    WHERE s.id = NEW.service_id;

    IF NOT FOUND OR v_service.is_active IS NOT TRUE THEN
      RAISE EXCEPTION 'This listing is not available' USING ERRCODE = '42501';
    END IF;
    IF v_service.freelancer_profile_id IS DISTINCT FROM NEW.freelancer_profile_id THEN
      RAISE EXCEPTION 'Listing does not belong to this freelancer' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.freelancer_profiles fp
    WHERE fp.id = NEW.freelancer_profile_id AND fp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You cannot send an offer to yourself' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_inquiries_pin_insert_state ON public.service_inquiries;
CREATE TRIGGER service_inquiries_pin_insert_state
  BEFORE INSERT ON public.service_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.service_inquiries_pin_insert_state();

-- ── B + C. completed_jobs only for an accepted hire, one row per hire ───────
CREATE OR REPLACE FUNCTION public.completed_jobs_pin_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.job_applications ja
    JOIN public.jobs j ON j.id = ja.job_id
    WHERE ja.job_id = NEW.job_id
      AND ja.freelancer_profile_id = NEW.freelancer_profile_id
      AND ja.status IN ('accepted', 'completed')
      AND j.hirer_profile_id = NEW.hirer_profile_id
  ) THEN
    RAISE EXCEPTION 'Only an accepted application can be marked completed' USING ERRCODE = '42501';
  END IF;

  NEW.completed_at := now();
  NEW.created_at := now();
  NEW.review_window_ends_at := now() + interval '14 days';
  NEW.hirer_confirmed := true;
  NEW.freelancer_confirmed := true;
  RETURN NEW;
END;
$$;

ALTER TABLE public.completed_jobs DROP CONSTRAINT IF EXISTS completed_jobs_job_id_key;
ALTER TABLE public.completed_jobs
  ADD CONSTRAINT completed_jobs_job_id_freelancer_profile_id_key UNIQUE (job_id, freelancer_profile_id);

-- ── D. Notification emails: read endpoint + shared secret from Vault ────────
-- The app.* settings were never configured, so no notification email was ever sent.
-- Vault secrets 'notify_email_function_url' and 'notify_email_webhook_secret' are created out of band.
CREATE OR REPLACE FUNCTION public.notify_via_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_url text;
  webhook_secret text;
BEGIN
  SELECT ds.decrypted_secret INTO base_url
  FROM vault.decrypted_secrets ds WHERE ds.name = 'notify_email_function_url';
  SELECT ds.decrypted_secret INTO webhook_secret
  FROM vault.decrypted_secrets ds WHERE ds.name = 'notify_email_webhook_secret';

  base_url := coalesce(nullif(base_url, ''), nullif(current_setting('app.edge_function_url', true), ''));
  webhook_secret := coalesce(nullif(webhook_secret, ''), nullif(current_setting('app.email_webhook_secret', true), ''));

  IF base_url IS NULL OR webhook_secret IS NULL THEN
    RAISE WARNING 'notify_via_email: function URL or webhook secret not configured; skipping';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := rtrim(base_url, '/') || '/send-notification-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Gigori-Webhook-Secret', webhook_secret
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.body,
      'link', NEW.link,
      'type', NEW.type
    ),
    timeout_milliseconds := 8000
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_via_email() FROM PUBLIC, anon, authenticated;
