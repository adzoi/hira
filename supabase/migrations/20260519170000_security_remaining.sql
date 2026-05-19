-- Remaining security hardening: visits, views, notifications, storage, contact RPC, account deletion, email webhook.

-- ── profile_visits: bind visitor_user_id to auth.uid() ───────────────────────
DROP POLICY IF EXISTS "Anyone can insert a profile visit" ON public.profile_visits;
DROP POLICY IF EXISTS "Valid profile visit insert" ON public.profile_visits;

CREATE POLICY "Valid profile visit insert"
  ON public.profile_visits
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    (
      visitor_user_id IS NULL
      AND auth.uid() IS NULL
    )
    OR (
      visitor_user_id IS NOT NULL
      AND auth.uid() IS NOT NULL
      AND visitor_user_id = auth.uid()
    )
  );

-- ── View counters: only bump existing open jobs / public services; no anon ───
CREATE OR REPLACE FUNCTION public.increment_job_views(p_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_count integer := 0;
BEGIN
  UPDATE public.jobs
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = p_job_id
    AND status = 'open'
  RETURNING views_count INTO next_count;

  IF next_count IS NULL THEN
    SELECT COALESCE(j.views_count, 0)
    INTO next_count
    FROM public.jobs j
    WHERE j.id = p_job_id;
  END IF;

  RETURN COALESCE(next_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_service_views(p_service_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_count integer := 0;
BEGIN
  UPDATE public.services s
  SET views_count = COALESCE(views_count, 0) + 1
  FROM public.freelancer_profiles fp
  WHERE s.id = p_service_id
    AND fp.id = s.freelancer_profile_id
    AND fp.is_public = true
  RETURNING s.views_count INTO next_count;

  IF next_count IS NULL THEN
    SELECT COALESCE(s.views_count, 0)
    INTO next_count
    FROM public.services s
    WHERE s.id = p_service_id;
  END IF;

  RETURN COALESCE(next_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_job_views(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_service_views(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_job_views(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.increment_service_views(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.increment_job_views(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_service_views(uuid) TO authenticated;

-- ── notifications: deny direct client INSERT ───────────────────────────────
REVOKE INSERT ON TABLE public.notifications FROM anon;
REVOKE INSERT ON TABLE public.notifications FROM authenticated;

-- ── Job hirer contact: applicants and job owner only ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_job_hirer_contact_for_applicant(p_job_id uuid)
RETURNS TABLE(email text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_hirer_user uuid;
BEGIN
  IF v_me IS NULL OR p_job_id IS NULL THEN
    RETURN;
  END IF;

  SELECT hp.user_id
  INTO v_hirer_user
  FROM public.jobs j
  INNER JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
  WHERE j.id = p_job_id;

  IF v_hirer_user IS NULL THEN
    RETURN;
  END IF;

  IF v_me = v_hirer_user THEN
    RETURN QUERY
    SELECT p.email, p.phone
    FROM public.profiles p
    WHERE p.id = v_hirer_user;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.job_applications ja
    INNER JOIN public.freelancer_profiles fp ON fp.id = ja.freelancer_profile_id
    WHERE ja.job_id = p_job_id
      AND fp.user_id = v_me
      AND ja.status IN ('pending', 'accepted')
  ) THEN
    RETURN QUERY
    SELECT p.email, p.phone
    FROM public.profiles p
    WHERE p.id = v_hirer_user;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_job_hirer_contact_for_applicant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_job_hirer_contact_for_applicant(uuid) TO authenticated;

-- ── Account deletion (auth.users row for current user only) ──────────────────
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;

-- ── Email trigger: prefer webhook secret over service role in DB settings ────
CREATE OR REPLACE FUNCTION public.notify_via_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_url text;
  webhook_secret text;
  sr_key text;
  req_headers jsonb;
BEGIN
  BEGIN
    base_url := current_setting('app.edge_function_url', true);
  EXCEPTION WHEN OTHERS THEN
    base_url := NULL;
  END;

  BEGIN
    webhook_secret := current_setting('app.email_webhook_secret', true);
  EXCEPTION WHEN OTHERS THEN
    webhook_secret := NULL;
  END;

  IF base_url IS NULL OR base_url = '' THEN
    RAISE WARNING 'notify_via_email: app.edge_function_url not set; skipping HTTP';
    RETURN NEW;
  END IF;

  IF webhook_secret IS NOT NULL AND webhook_secret <> '' THEN
    req_headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Gigori-Webhook-Secret', webhook_secret
    );
  ELSE
    BEGIN
      sr_key := current_setting('app.service_role_key', true);
    EXCEPTION WHEN OTHERS THEN
      sr_key := NULL;
    END;

    IF sr_key IS NULL OR sr_key = '' THEN
      RAISE WARNING 'notify_via_email: app.email_webhook_secret or app.service_role_key not set; skipping HTTP';
      RETURN NEW;
    END IF;

    req_headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || sr_key
    );
  END IF;

  PERFORM net.http_post(
    url := rtrim(base_url, '/') || '/send-notification-email',
    headers := req_headers,
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

COMMENT ON FUNCTION public.notify_via_email() IS
  'POSTs new notification to send-notification-email. Prefer app.email_webhook_secret; legacy fallback app.service_role_key.';

-- ── Storage: owner delete for job/service images ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'job_images_owner_delete'
  ) THEN
    CREATE POLICY job_images_owner_delete
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'job-images'
        AND split_part(name, '/', 1) IN (
          SELECT hp.id::text
          FROM public.hirer_profiles hp
          WHERE hp.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'service_images_owner_delete'
  ) THEN
    CREATE POLICY service_images_owner_delete
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'service-images'
        AND split_part(name, '/', 1) IN (
          SELECT fp.id::text
          FROM public.freelancer_profiles fp
          WHERE fp.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_owner_all'
  ) THEN
    CREATE POLICY avatars_owner_all
      ON storage.objects
      FOR ALL
      TO authenticated
      USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'cvs_owner_all'
  ) THEN
    CREATE POLICY cvs_owner_all
      ON storage.objects
      FOR ALL
      TO authenticated
      USING (bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;
