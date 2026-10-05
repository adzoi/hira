-- Security hardening (deep audit 2026-10-05, round 5).
--   A. profiles.email / profiles.phone were readable by anon for every hirer and public freelancer.
--   B. Owners could write system-maintained columns (ratings, review/job counters, VIP flags, view counts).
--   C. service_inquiries: legacy si_update_own bypassed the identity check; status transitions unchecked.
--   D. Inquiry reviews required only a relationship, not an accepted engagement.
--   E. Expired-job cleanup moves from public edge requests to pg_cron; VIP payment records survive job deletion.
--   F. Defense in depth: no TRUNCATE/TRIGGER/REFERENCES or anon writes on API tables; CV bucket limits.

-- ── A. Contact details off the public profiles surface ──────────────────────
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, user_type, full_name, city, avatar_url, is_verified, is_active, is_online,
  member_since, created_at, updated_at, cv_url
) ON public.profiles TO anon, authenticated;
GRANT SELECT (unread_notifications_count, unread_messages_count) ON public.profiles TO authenticated;

-- Own row including email/phone (replaces client `select("*")` on the caller's profile).
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.* FROM public.profiles p WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- Signed-in users may see contact details of public freelancers (the profile "show contact" button).
-- Hirer contact stays behind get_job_hirer_contact_for_applicant.
CREATE OR REPLACE FUNCTION public.get_profile_contact(p_user_id uuid)
RETURNS TABLE(email text, phone text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF p_user_id = v_me OR EXISTS (
    SELECT 1 FROM public.freelancer_profiles fp
    WHERE fp.user_id = p_user_id AND fp.is_public IS TRUE
  ) THEN
    RETURN QUERY SELECT p.email, p.phone FROM public.profiles p WHERE p.id = p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_profile_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_contact(uuid) TO authenticated;

-- ── B. System-maintained columns ─────────────────────────────────────────────
-- SECURITY INVOKER on purpose: inside SECURITY DEFINER functions/triggers current_user is the owner,
-- so legitimate system writes (rating trigger, view counters, VIP activation/expiry) pass through.
CREATE OR REPLACE FUNCTION public.protect_freelancer_profile_system_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.average_rating := NULL;
    NEW.total_reviews_count := 0;
    NEW.completed_jobs_count := 0;
    NEW.is_vip := false;
    NEW.vip_tier := NULL;
    NEW.vip_expires_at := NULL;
  ELSE
    NEW.average_rating := OLD.average_rating;
    NEW.total_reviews_count := OLD.total_reviews_count;
    NEW.completed_jobs_count := OLD.completed_jobs_count;
    NEW.is_vip := OLD.is_vip;
    NEW.vip_tier := OLD.vip_tier;
    NEW.vip_expires_at := OLD.vip_expires_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_hirer_profile_system_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.jobs_posted_count := 0;
    NEW.completed_jobs_count := 0;
    NEW.average_rating_given := NULL;
  ELSE
    NEW.jobs_posted_count := OLD.jobs_posted_count;
    NEW.completed_jobs_count := OLD.completed_jobs_count;
    NEW.average_rating_given := OLD.average_rating_given;
  END IF;
  RETURN NEW;
END;
$$;

-- accepted_count stays client-managed (optimistic increment in the hirer accept flow).
CREATE OR REPLACE FUNCTION public.protect_job_system_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_vip := false;
    NEW.vip_tier := NULL;
    NEW.vip_expires_at := NULL;
    NEW.is_featured := false;
    NEW.views_count := 0;
  ELSE
    NEW.is_vip := OLD.is_vip;
    NEW.vip_tier := OLD.vip_tier;
    NEW.vip_expires_at := OLD.vip_expires_at;
    NEW.is_featured := OLD.is_featured;
    NEW.views_count := OLD.views_count;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_service_system_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_vip := false;
    NEW.vip_tier := NULL;
    NEW.vip_expires_at := NULL;
    NEW.views_count := 0;
  ELSE
    NEW.is_vip := OLD.is_vip;
    NEW.vip_tier := OLD.vip_tier;
    NEW.vip_expires_at := OLD.vip_expires_at;
    NEW.views_count := OLD.views_count;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_freelancer_profile_system_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_hirer_profile_system_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_job_system_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_service_system_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_system_columns ON public.freelancer_profiles;
CREATE TRIGGER protect_system_columns
  BEFORE INSERT OR UPDATE ON public.freelancer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_freelancer_profile_system_columns();

DROP TRIGGER IF EXISTS protect_system_columns ON public.hirer_profiles;
CREATE TRIGGER protect_system_columns
  BEFORE INSERT OR UPDATE ON public.hirer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_hirer_profile_system_columns();

DROP TRIGGER IF EXISTS protect_system_columns ON public.jobs;
CREATE TRIGGER protect_system_columns
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.protect_job_system_columns();

DROP TRIGGER IF EXISTS protect_system_columns ON public.services;
CREATE TRIGGER protect_system_columns
  BEFORE INSERT OR UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.protect_service_system_columns();

-- Counter triggers ran as the caller; as definers they keep working with the protection above.
ALTER FUNCTION public.handle_job_posted() SECURITY DEFINER;
ALTER FUNCTION public.handle_job_completion() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.handle_job_posted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_job_completion() FROM PUBLIC, anon, authenticated;

-- ── C. service_inquiries updates ─────────────────────────────────────────────
-- Permissive policies OR together, so this legacy policy cancelled the identity check below it.
DROP POLICY IF EXISTS si_update_own ON public.service_inquiries;

-- Freelancer: accept/decline a pending offer, start work, mark done (completes after hirer_done).
-- Hirer: mark done (completes). Cancellation only via the mutual cancel_requested_by handshake.
-- Named zz_ so it fires after on_inquiry_cancel_requested (which may set status = 'cancelled').
CREATE OR REPLACE FUNCTION public.service_inquiries_enforce_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_ok boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.freelancer_profiles fp WHERE fp.id = OLD.freelancer_profile_id AND fp.user_id = v_uid) THEN
    v_role := 'freelancer';
  ELSIF EXISTS (SELECT 1 FROM public.hirer_profiles hp WHERE hp.id = OLD.hirer_profile_id AND hp.user_id = v_uid) THEN
    v_role := 'hirer';
  ELSE
    RETURN NEW;
  END IF;

  IF NEW.cancel_requested_by IS DISTINCT FROM OLD.cancel_requested_by
     AND NEW.cancel_requested_by IS NOT NULL
     AND NEW.cancel_requested_by <> v_role THEN
    RAISE EXCEPTION 'Cannot request cancellation on behalf of the other party' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'freelancer' AND NEW.deleted_by_hirer IS DISTINCT FROM OLD.deleted_by_hirer THEN
    RAISE EXCEPTION 'Cannot change deleted_by_hirer' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'hirer' AND NEW.deleted_by_freelancer IS DISTINCT FROM OLD.deleted_by_freelancer THEN
    RAISE EXCEPTION 'Cannot change deleted_by_freelancer' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    NEW.completed_at := OLD.completed_at;
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' THEN
    -- Only reachable through the mutual handshake trigger.
    v_ok := OLD.cancel_requested_by IS NOT NULL AND OLD.cancel_requested_by <> v_role;
  ELSIF v_role = 'freelancer' THEN
    v_ok := (OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined'))
         OR (OLD.status = 'accepted' AND NEW.status IN ('in_progress', 'freelancer_done'))
         OR (OLD.status = 'in_progress' AND NEW.status = 'freelancer_done')
         OR (OLD.status = 'hirer_done' AND NEW.status = 'completed');
  ELSE
    v_ok := OLD.status IN ('accepted', 'in_progress', 'freelancer_done')
            AND NEW.status IN ('hirer_done', 'completed');
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Invalid inquiry status change % -> % for %', OLD.status, NEW.status, v_role
      USING ERRCODE = '42501';
  END IF;

  NEW.completed_at := CASE WHEN NEW.status = 'completed' THEN now() ELSE OLD.completed_at END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.service_inquiries_enforce_transitions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_service_inquiries_enforce_transitions ON public.service_inquiries;
CREATE TRIGGER zz_service_inquiries_enforce_transitions
  BEFORE UPDATE ON public.service_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.service_inquiries_enforce_transitions();

-- ── D. Inquiry reviews need an engagement the freelancer accepted ────────────
-- Reviews are submitted before the reviewer marks the inquiry done, so `completed` is not required.
CREATE OR REPLACE FUNCTION public.can_user_insert_review(_completed_job_id uuid, _service_inquiry_id uuid, _reviewee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN _completed_job_id IS NOT NULL AND _service_inquiry_id IS NULL THEN
        EXISTS (
          SELECT 1
          FROM public.completed_jobs cj
          JOIN public.hirer_profiles hp ON hp.id = cj.hirer_profile_id
          JOIN public.freelancer_profiles fp ON fp.id = cj.freelancer_profile_id
          WHERE cj.id = _completed_job_id
            AND (
              (hp.user_id = auth.uid() AND fp.user_id = _reviewee_id)
              OR
              (fp.user_id = auth.uid() AND hp.user_id = _reviewee_id)
            )
        )
      WHEN _service_inquiry_id IS NOT NULL AND _completed_job_id IS NULL THEN
        EXISTS (
          SELECT 1
          FROM public.service_inquiries si
          JOIN public.hirer_profiles hp ON hp.id = si.hirer_profile_id
          JOIN public.freelancer_profiles fp ON fp.id = si.freelancer_profile_id
          WHERE si.id = _service_inquiry_id
            AND si.status IN ('accepted', 'in_progress', 'freelancer_done', 'hirer_done', 'completed')
            AND (
              (hp.user_id = auth.uid() AND fp.user_id = _reviewee_id)
              OR
              (fp.user_id = auth.uid() AND hp.user_id = _reviewee_id)
            )
        )
      ELSE FALSE
    END
$$;

-- ── E. Expired-job cleanup ───────────────────────────────────────────────────
-- Public edge functions deleted expired jobs with the service role on every request, and the
-- vip_payments FK cascaded, erasing paid VIP records. Keep payments; run cleanup on a schedule.
ALTER TABLE public.vip_payments ALTER COLUMN job_id DROP NOT NULL;
ALTER TABLE public.vip_payments DROP CONSTRAINT IF EXISTS vip_payments_job_id_fkey;
ALTER TABLE public.vip_payments
  ADD CONSTRAINT vip_payments_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.delete_expired_open_jobs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.jobs
  WHERE status = 'open'
    AND (application_deadline < current_date OR expires_at <= now());
$$;

REVOKE ALL ON FUNCTION public.delete_expired_open_jobs() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'delete-expired-open-jobs';
    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;
    PERFORM cron.schedule('delete-expired-open-jobs', '*/15 * * * *', 'SELECT public.delete_expired_open_jobs();');
  END IF;
END $$;

-- ── F. Defense in depth ──────────────────────────────────────────────────────
-- PostgREST never needs these; TRUNCATE in particular bypasses RLS.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;

-- Signed-out visitors only write profile visits (counters go through SECURITY DEFINER RPCs).
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;
GRANT INSERT ON public.profile_visits TO anon;

-- Used by the si_*_update_own WITH CHECK clauses, so signed-in users keep EXECUTE.
REVOKE ALL ON FUNCTION public.service_inquiry_identity_unchanged(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.service_inquiry_identity_unchanged(uuid, uuid, uuid, uuid) TO authenticated;

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf']
WHERE id = 'cvs';
