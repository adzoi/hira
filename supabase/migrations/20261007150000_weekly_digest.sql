-- Weekly "new jobs in your field" email for freelancers.
-- send-weekly-digest (edge function) claims batches through claim_weekly_digest_batch() and
-- emails everyone with at least one matching job. pg_cron fires it on Monday mornings, reusing
-- the Vault secrets of the notification-email trigger.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_digest_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_digest_sent_at timestamptz;

COMMENT ON COLUMN public.profiles.weekly_digest_enabled IS
  'Freelancer opted in to the weekly job digest email (Settings toggle / unsubscribe link).';
COMMENT ON COLUMN public.profiles.weekly_digest_sent_at IS
  'Last time this user was processed by the weekly digest (set even when nothing matched).';

-- Users may switch the digest off and on themselves.
GRANT UPDATE (weekly_digest_enabled) ON public.profiles TO authenticated;

CREATE INDEX IF NOT EXISTS idx_jobs_open_created_at ON public.jobs (created_at DESC) WHERE status = 'open';

-- Atomically claims up to p_limit due freelancers (marks them processed) and returns their matches.
-- Concurrent runs never pick the same row (SKIP LOCKED).
CREATE OR REPLACE FUNCTION public.claim_weekly_digest_batch(p_limit integer DEFAULT 50)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  job_count integer,
  jobs json
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  lim integer := greatest(1, least(coalesce(p_limit, 50), 200));
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT p.id
    FROM profiles p
    WHERE p.user_type = 'freelancer'
      AND p.is_active = true
      AND p.weekly_digest_enabled = true
      AND (p.weekly_digest_sent_at IS NULL OR p.weekly_digest_sent_at < now() - interval '6 days')
    ORDER BY p.weekly_digest_sent_at NULLS FIRST
    LIMIT lim
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE profiles p
    SET weekly_digest_sent_at = now()
    FROM due
    WHERE p.id = due.id
    RETURNING p.id, p.full_name
  ),
  freelancer AS (
    SELECT c.id AS uid, c.full_name, fp.id AS fp_id
    FROM claimed c
    JOIN freelancer_profiles fp ON fp.user_id = c.id
  ),
  matches AS (
    SELECT
      f.uid,
      j.id,
      j.title,
      j.budget_type,
      j.budget_min,
      j.budget_max,
      j.location_type,
      j.created_at,
      (
        SELECT count(*)
        FROM job_skills js
        JOIN freelancer_skills fs ON fs.skill_id = js.skill_id AND fs.freelancer_profile_id = f.fp_id
        WHERE js.job_id = j.id
      ) AS overlap
    FROM freelancer f
    JOIN jobs j
      ON j.status = 'open'
     AND j.created_at > now() - interval '7 days'
     AND (j.expires_at IS NULL OR j.expires_at > now())
     AND (
       EXISTS (
         SELECT 1
         FROM job_skills js
         JOIN freelancer_skills fs ON fs.skill_id = js.skill_id AND fs.freelancer_profile_id = f.fp_id
         WHERE js.job_id = j.id
       )
       OR j.category_id IN (
         SELECT c.id
         FROM freelancer_skills fs
         JOIN skills sk ON sk.id = fs.skill_id
         JOIN categories c ON c.id = sk.category_id OR c.id = (SELECT pc.parent_id FROM categories pc WHERE pc.id = sk.category_id)
         WHERE fs.freelancer_profile_id = f.fp_id
       )
     )
    WHERE NOT EXISTS (
      SELECT 1 FROM job_applications ja WHERE ja.job_id = j.id AND ja.freelancer_profile_id = f.fp_id
    )
  )
  SELECT
    f.uid,
    u.email::text,
    f.full_name,
    (SELECT count(*)::int FROM matches m WHERE m.uid = f.uid),
    (
      SELECT coalesce(json_agg(x), '[]'::json)
      FROM (
        SELECT m.id, m.title, m.budget_type, m.budget_min, m.budget_max, m.location_type
        FROM matches m
        WHERE m.uid = f.uid
        ORDER BY m.overlap DESC, m.created_at DESC
        LIMIT 5
      ) x
    )
  FROM freelancer f
  JOIN auth.users u ON u.id = f.uid
  WHERE u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_weekly_digest_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_weekly_digest_batch(integer) TO service_role;

-- Called by pg_cron; posts to the edge function with the shared webhook secret.
CREATE OR REPLACE FUNCTION public.trigger_weekly_digest()
RETURNS void
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

  IF nullif(base_url, '') IS NULL OR nullif(webhook_secret, '') IS NULL THEN
    RAISE WARNING 'trigger_weekly_digest: Vault secrets missing; skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(base_url, '/') || '/send-weekly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Gigori-Webhook-Secret', webhook_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_weekly_digest() FROM PUBLIC, anon, authenticated;

-- Mondays 06:00–09:00 UTC (10:00–13:00 Tbilisi). Each run drains up to a few hundred users;
-- the extra hourly runs pick up anyone left over. Already-processed users are skipped for 6 days.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'weekly-job-digest';
    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;
    PERFORM cron.schedule('weekly-job-digest', '0 6-9 * * 1', 'SELECT public.trigger_weekly_digest();');
  END IF;
END $$;
