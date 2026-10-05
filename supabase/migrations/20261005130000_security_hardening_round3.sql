-- Security hardening (audit 2026-10-05).
--   A. Chat Realtime broadcasts move to private channels (were public topics anyone with the anon key could join).
--   B. completed_jobs: no client UPDATE (participants could re-point hirer_profile_id and review arbitrary hirers).
--   D. cvs bucket becomes private; profiles.cv_url stores the object path, reads go through signed URLs.
--   E. job_applications: applicants can no longer UPDATE their applications; hirers may change status only.
--   F. Internal helper functions are no longer callable via PostgREST by anon/authenticated.
--   G. forum author_name is derived from the author's profile instead of trusted from the client.

-- ── A. Private chat broadcasts ───────────────────────────────────────────────
-- The trigger is now the only sender: recipient inbox (`inbox-broadcast:{user_id}`) and the open thread
-- (`chat-broadcast:{conversation_id}`). Clients only subscribe; with no INSERT policy on realtime.messages
-- they cannot publish to (or spoof messages on) these topics.

CREATE OR REPLACE FUNCTION public.notify_recipient_new_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_sender_name text;
  v_body text;
  v_payload jsonb;
BEGIN
  SELECT
    CASE
      WHEN c.participant_low = NEW.sender_id THEN c.participant_high
      ELSE c.participant_low
    END
  INTO v_recipient
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF v_recipient IS NULL OR v_recipient = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, 'მომხმარებელი')
  INTO v_sender_name
  FROM public.profiles p
  WHERE p.id = NEW.sender_id;

  IF NEW.body IS NOT NULL AND char_length(btrim(NEW.body)) > 0 THEN
    v_body := NEW.body;
  ELSE
    v_body := 'Sent a file: ' || COALESCE(NULLIF(btrim(NEW.attachment_name), ''), 'file');
  END IF;

  v_payload := jsonb_build_object(
    'messageId', NEW.id,
    'conversationId', NEW.conversation_id,
    'senderId', NEW.sender_id,
    'senderName', v_sender_name,
    'body', v_body,
    'attachmentUrl', NEW.attachment_url,
    'attachmentName', NEW.attachment_name,
    'attachmentType', NEW.attachment_type,
    'attachmentSizeBytes', NEW.attachment_size_bytes,
    'createdAt', NEW.created_at
  );

  BEGIN
    PERFORM realtime.send(v_payload, 'chat_message', 'inbox-broadcast:' || v_recipient::text, true);
    -- Open thread shows the real body (empty for attachment-only messages), not the inbox preview text.
    PERFORM realtime.send(
      v_payload || jsonb_build_object('body', COALESCE(NEW.body, '')),
      'message',
      'chat-broadcast:' || NEW.conversation_id::text,
      true
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_recipient_new_chat_message: realtime.send failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS chat_broadcast_private_select ON realtime.messages;
CREATE POLICY chat_broadcast_private_select
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND (
      realtime.topic() = 'inbox-broadcast:' || auth.uid()::text
      OR CASE
        WHEN realtime.topic() ~ '^chat-broadcast:[0-9a-fA-F-]{36}$' THEN
          public.is_conversation_participant(split_part(realtime.topic(), ':', 2)::uuid, auth.uid())
        ELSE false
      END
    )
  );

-- ── B. completed_jobs: insert-only for clients ───────────────────────────────
DROP POLICY IF EXISTS cj_update ON public.completed_jobs;
REVOKE UPDATE ON public.completed_jobs FROM anon, authenticated;

-- Review fraud checks compare message timestamps against completed_at; don't let the client choose it.
CREATE OR REPLACE FUNCTION public.completed_jobs_pin_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.completed_at := now();
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS completed_jobs_pin_timestamps ON public.completed_jobs;
CREATE TRIGGER completed_jobs_pin_timestamps
  BEFORE INSERT ON public.completed_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.completed_jobs_pin_timestamps();

-- ── D. Private CV bucket ─────────────────────────────────────────────────────
UPDATE storage.buckets SET public = false WHERE id = 'cvs';

-- cv_url held a public object URL; it now stores the object path (`{user_id}/cv.pdf`).
UPDATE public.profiles
SET cv_url = id::text || '/cv.pdf'
WHERE cv_url IS NOT NULL;

-- Owners keep full access via cvs_owner_all. Signed-in users may read CVs of public freelancers
-- (needed to mint signed URLs on the profile page).
DROP POLICY IF EXISTS cvs_public_freelancer_select ON storage.objects;
CREATE POLICY cvs_public_freelancer_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'cvs'
    AND EXISTS (
      SELECT 1
      FROM public.freelancer_profiles fp
      WHERE fp.user_id::text = (storage.foldername(name))[1]
        AND fp.is_public IS TRUE
    )
  );

-- ── E. job_applications: hirer-controlled status only ────────────────────────
-- Live ja_update let either party rewrite any column (an applicant could self-accept). Split it per role;
-- the trigger below pins which of the granted columns each role may actually change.
DROP POLICY IF EXISTS ja_update ON public.job_applications;
REVOKE UPDATE ON public.job_applications FROM anon, authenticated;
GRANT UPDATE (status, deleted_by_hirer, deleted_by_freelancer) ON public.job_applications TO authenticated;

-- Applicants could not read their own rows (baseline ja_select was missing in prod), which also broke
-- INSERT ... RETURNING on apply and the freelancer "delete offer" update.
DROP POLICY IF EXISTS ja_select ON public.job_applications;
DROP POLICY IF EXISTS ja_select_applicant ON public.job_applications;
CREATE POLICY ja_select_applicant
  ON public.job_applications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = job_applications.freelancer_profile_id
        AND fp.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Hirers manage applications on own jobs" ON public.job_applications;
DROP POLICY IF EXISTS ja_update_hirer ON public.job_applications;
CREATE POLICY ja_update_hirer
  ON public.job_applications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      INNER JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
      WHERE j.id = job_applications.job_id
        AND hp.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      INNER JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
      WHERE j.id = job_applications.job_id
        AND hp.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS ja_update_applicant ON public.job_applications;
CREATE POLICY ja_update_applicant
  ON public.job_applications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = job_applications.freelancer_profile_id
        AND fp.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = job_applications.freelancer_profile_id
        AND fp.user_id = (SELECT auth.uid())
    )
  );

-- Hirer: status + deleted_by_hirer. Applicant: deleted_by_freelancer only (no self-accept).
CREATE OR REPLACE FUNCTION public.job_applications_enforce_update_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.jobs j
    INNER JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
    WHERE j.id = OLD.job_id
      AND hp.user_id = v_uid
  ) THEN
    IF NEW.deleted_by_freelancer IS DISTINCT FROM OLD.deleted_by_freelancer THEN
      RAISE EXCEPTION 'Hirers cannot change deleted_by_freelancer' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.deleted_by_hirer IS DISTINCT FROM OLD.deleted_by_hirer THEN
    RAISE EXCEPTION 'Applicants may only hide their own application' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.job_applications_enforce_update_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS job_applications_enforce_update_columns ON public.job_applications;
CREATE TRIGGER job_applications_enforce_update_columns
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.job_applications_enforce_update_columns();

-- ── F. Internal helpers: not part of the public RPC surface ──────────────────
-- Supabase grants EXECUTE on new functions to anon/authenticated directly, so REVOKE FROM PUBLIC
-- alone did not block them. Callers are SECURITY DEFINER triggers/functions, cron, or service_role.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    INNER JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'run_trust_flag_detection',
        'analyze_catalog_search_paths',
        'record_catalog_search_path_sample_jobs',
        'record_catalog_search_path_sample_listings',
        'bump_catalog_search_path_daily',
        'assert_insert_rate_limit',
        'conversation_exchange_stats_before',
        'review_requires_conversation_messages'
      ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- ── G. Forum author names come from profiles ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.forum_set_author_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.author_name := OLD.author_name;
    RETURN NEW;
  END IF;

  SELECT left(NULLIF(btrim(p.full_name), ''), 120)
  INTO NEW.author_name
  FROM public.profiles p
  WHERE p.id = NEW.author_id;

  NEW.author_name := COALESCE(NEW.author_name, 'მომხმარებელი');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.forum_set_author_name() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS forum_posts_set_author_name ON public.forum_posts;
CREATE TRIGGER forum_posts_set_author_name
  BEFORE INSERT OR UPDATE OF author_name ON public.forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.forum_set_author_name();

DROP TRIGGER IF EXISTS forum_comments_set_author_name ON public.forum_comments;
CREATE TRIGGER forum_comments_set_author_name
  BEFORE INSERT OR UPDATE OF author_name ON public.forum_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.forum_set_author_name();
