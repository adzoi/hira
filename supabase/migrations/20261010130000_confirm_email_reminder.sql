-- A quarter of unfinished signups never confirmed their email. Send each of them one
-- reminder (24 hours to 30 days after signup) with a fresh link that confirms the address
-- and lands on onboarding. The row in email_confirm_reminders is the "already sent" marker.

CREATE TABLE IF NOT EXISTS public.email_confirm_reminders (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_confirm_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_confirm_reminders FROM PUBLIC, anon, authenticated;

-- Claims due users atomically so overlapping runs never email anyone twice.
CREATE OR REPLACE FUNCTION public.claim_confirm_reminder_batch(p_limit integer DEFAULT 50)
RETURNS TABLE (user_id uuid, email text, full_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH due AS (
    SELECT u.id
    FROM auth.users u
    WHERE u.email_confirmed_at IS NULL
      AND u.email IS NOT NULL
      AND u.created_at < now() - interval '24 hours'
      AND u.created_at > now() - interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM public.email_confirm_reminders r WHERE r.user_id = u.id)
    ORDER BY u.created_at
    LIMIT greatest(1, least(p_limit, 200))
  ),
  claimed AS (
    INSERT INTO public.email_confirm_reminders (user_id)
    SELECT id FROM due
    ON CONFLICT DO NOTHING
    RETURNING email_confirm_reminders.user_id
  )
  SELECT c.user_id, u.email::text, p.full_name
  FROM claimed c
  JOIN auth.users u ON u.id = c.user_id
  LEFT JOIN public.profiles p ON p.id = c.user_id;
$$;

REVOKE ALL ON FUNCTION public.claim_confirm_reminder_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_confirm_reminder_batch(integer) TO service_role;

-- Called by pg_cron; posts to the edge function with the shared webhook secret.
CREATE OR REPLACE FUNCTION public.trigger_confirm_reminders()
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
    RAISE WARNING 'trigger_confirm_reminders: Vault secrets missing; skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(base_url, '/') || '/send-confirm-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Gigori-Webhook-Secret', webhook_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_confirm_reminders() FROM PUBLIC, anon, authenticated;

-- Hourly, so each person hears from us roughly 24-25 hours after signing up.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'confirm-email-reminders';
    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;
    PERFORM cron.schedule('confirm-email-reminders', '20 * * * *', 'SELECT public.trigger_confirm_reminders();');
  END IF;
END $$;
