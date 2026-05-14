-- Include notification type + payload in the email edge payload (offers, job applications, etc.).

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
      'link', NEW.link,
      'type', NEW.type,
      'payload', coalesce(NEW.payload, '{}'::jsonb)
    ),
    timeout_milliseconds := 8000
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_via_email() IS
  'POSTs new notification to send-notification-email (user_id, title, body, link, type, payload). Requires app.edge_function_url + app.service_role_key.';
