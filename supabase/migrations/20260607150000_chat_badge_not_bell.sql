-- Chat messages belong on the chat icon only, not the bell notifications feed.

CREATE OR REPLACE FUNCTION public.notify_recipient_new_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_sender_name text;
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

  BEGIN
    PERFORM realtime.send(
      jsonb_build_object(
        'messageId', NEW.id,
        'conversationId', NEW.conversation_id,
        'senderId', NEW.sender_id,
        'senderName', v_sender_name,
        'body', NEW.body,
        'createdAt', NEW.created_at
      ),
      'chat_message',
      'inbox-broadcast:' || v_recipient::text,
      false
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_recipient_new_chat_message: realtime.send failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DELETE FROM public.notifications WHERE type = 'chat_message';

UPDATE public.profiles p
SET unread_notifications_count = (
  SELECT COUNT(*)::int
  FROM public.notifications n
  WHERE n.user_id = p.id
    AND n.is_read = false
    AND n.type <> 'chat_message'
);

CREATE OR REPLACE FUNCTION public.increment_unread_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'chat_message' THEN
    RETURN NEW;
  END IF;
  UPDATE public.profiles
  SET unread_notifications_count = unread_notifications_count + 1
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;
