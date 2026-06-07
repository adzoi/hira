-- Push chat notifications to the recipient's navbar via Realtime broadcast (public topic).
-- Client listens on topic inbox-broadcast:{user_id}.

CREATE OR REPLACE FUNCTION public.notify_recipient_new_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_sender_name text;
  v_preview text;
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

  v_preview := left(btrim(NEW.body), 120);
  IF char_length(btrim(NEW.body)) > 120 THEN
    v_preview := v_preview || '…';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, link, type, is_read)
  VALUES (
    v_recipient,
    format('ახალი შეტყობინება — %s', v_sender_name),
    v_preview,
    '/messages/' || NEW.conversation_id::text,
    'chat_message',
    false
  );

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
