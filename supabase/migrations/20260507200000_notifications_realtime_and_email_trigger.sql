-- Allow clients to read/update only their rows (Realtime + mark read).
DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Realtime: stream INSERTs to authenticated clients (Navbar).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- pg_net: HTTP from Postgres to Edge Function (configure DB settings in dashboard).
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_via_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_url text;
  sr_key text;
BEGIN
  BEGIN
    base_url := current_setting('app.edge_function_url', true);
  EXCEPTION WHEN OTHERS THEN
    base_url := NULL;
  END;

  BEGIN
    sr_key := current_setting('app.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    sr_key := NULL;
  END;

  IF base_url IS NULL OR base_url = '' OR sr_key IS NULL OR sr_key = '' THEN
    RAISE WARNING 'notify_via_email: app.edge_function_url or app.service_role_key not set; skipping HTTP';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := rtrim(base_url, '/') || '/send-notification-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || sr_key
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.body,
      'link', NEW.link
    ),
    timeout_milliseconds := 8000
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_via_email() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_notification_created ON public.notifications;

CREATE TRIGGER on_notification_created
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_via_email();

COMMENT ON FUNCTION public.notify_via_email() IS
  'POSTs new notification to send-notification-email Edge Function via pg_net; requires app.edge_function_url and app.service_role_key database settings.';
