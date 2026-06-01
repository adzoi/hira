-- Denormalized unread counters on profiles (maintained by triggers).
-- Messages use conversation_reads.last_read_at (messages have no is_read column).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS unread_notifications_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unread_messages_count INT NOT NULL DEFAULT 0;

UPDATE public.profiles p
SET unread_notifications_count = (
  SELECT COUNT(*)::int
  FROM public.notifications n
  WHERE n.user_id = p.id
    AND n.is_read = false
);

UPDATE public.profiles p
SET unread_messages_count = (
  SELECT COUNT(*)::int
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE m.sender_id <> p.id
    AND (c.participant_low = p.id OR c.participant_high = p.id)
    AND m.created_at > COALESCE(
      (
        SELECT cr.last_read_at
        FROM public.conversation_reads cr
        WHERE cr.conversation_id = c.id
          AND cr.user_id = p.id
      ),
      '-infinity'::timestamptz
    )
);

CREATE OR REPLACE FUNCTION public.increment_unread_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET unread_notifications_count = unread_notifications_count + 1
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_unread_notifications ON public.notifications;
CREATE TRIGGER trg_increment_unread_notifications
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_unread_notifications();

CREATE OR REPLACE FUNCTION public.decrement_unread_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_read = false AND NEW.is_read = true THEN
    UPDATE public.profiles
    SET unread_notifications_count = GREATEST(0, unread_notifications_count - 1)
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decrement_unread_notifications ON public.notifications;
CREATE TRIGGER trg_decrement_unread_notifications
  AFTER UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_unread_notifications();

CREATE OR REPLACE FUNCTION public.increment_unread_messages()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient_id uuid;
BEGIN
  SELECT
    CASE
      WHEN c.participant_low = NEW.sender_id THEN c.participant_high
      ELSE c.participant_low
    END
  INTO recipient_id
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF recipient_id IS NOT NULL THEN
    UPDATE public.profiles
    SET unread_messages_count = unread_messages_count + 1
    WHERE id = recipient_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_unread_messages ON public.messages;
CREATE TRIGGER trg_increment_unread_messages
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_unread_messages();

CREATE OR REPLACE FUNCTION public.decrement_unread_messages_on_read()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev_last_read timestamptz;
  newly_read bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    prev_last_read := '-infinity'::timestamptz;
  ELSE
    IF NEW.last_read_at <= OLD.last_read_at THEN
      RETURN NEW;
    END IF;
    prev_last_read := OLD.last_read_at;
  END IF;

  SELECT COUNT(*)::bigint
  INTO newly_read
  FROM public.messages m
  WHERE m.conversation_id = NEW.conversation_id
    AND m.sender_id <> NEW.user_id
    AND m.created_at > prev_last_read
    AND m.created_at <= NEW.last_read_at;

  IF newly_read > 0 THEN
    UPDATE public.profiles
    SET unread_messages_count = GREATEST(0, unread_messages_count - newly_read)
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decrement_unread_messages ON public.messages;
DROP TRIGGER IF EXISTS trg_decrement_unread_messages_on_read ON public.conversation_reads;
CREATE TRIGGER trg_decrement_unread_messages_on_read
  AFTER INSERT OR UPDATE OF last_read_at ON public.conversation_reads
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_unread_messages_on_read();
