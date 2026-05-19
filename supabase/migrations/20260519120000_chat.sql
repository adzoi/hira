-- Direct messaging: conversations, messages, read state, realtime, notifications.
-- Idempotent for databases where chat tables were created outside migration history.

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_low uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  participant_high uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  job_application_id uuid REFERENCES public.job_applications (id) ON DELETE SET NULL,
  service_inquiry_id uuid REFERENCES public.service_inquiries (id) ON DELETE SET NULL,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_participants_ordered CHECK (participant_low < participant_high),
  CONSTRAINT conversations_one_context CHECK (
    NOT (job_application_id IS NOT NULL AND service_inquiry_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.conversations IS '1:1 chat threads between two users, optionally tied to a job application or listing inquiry.';

CREATE UNIQUE INDEX IF NOT EXISTS conversations_direct_pair_idx
  ON public.conversations (participant_low, participant_high)
  WHERE job_application_id IS NULL AND service_inquiry_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_job_application_idx
  ON public.conversations (job_application_id)
  WHERE job_application_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_service_inquiry_idx
  ON public.conversations (service_inquiry_id)
  WHERE service_inquiry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversations_last_message_at_idx ON public.conversations (last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_body_not_blank CHECK (char_length(btrim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON public.messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.conversation_reads (
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- Normalize participant order (low < high).
CREATE OR REPLACE FUNCTION public.conversation_participant_pair(a uuid, b uuid)
RETURNS TABLE (participant_low uuid, participant_high uuid)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LEAST(a, b), GREATEST(a, b);
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND (c.participant_low = p_user_id OR c.participant_high = p_user_id)
  );
$$;

REVOKE ALL ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  p_other_user_id uuid,
  p_job_application_id uuid DEFAULT NULL,
  p_service_inquiry_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_other_user_id IS NULL OR p_other_user_id = v_me THEN
    RAISE EXCEPTION 'Invalid conversation participant';
  END IF;

  SELECT participant_low, participant_high
  INTO v_low, v_high
  FROM public.conversation_participant_pair(v_me, p_other_user_id);

  IF p_job_application_id IS NOT NULL THEN
    SELECT c.id INTO v_id
    FROM public.conversations c
    WHERE c.job_application_id = p_job_application_id
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;

    INSERT INTO public.conversations (participant_low, participant_high, job_application_id)
    VALUES (v_low, v_high, p_job_application_id)
    RETURNING id INTO v_id;

    RETURN v_id;
  END IF;

  IF p_service_inquiry_id IS NOT NULL THEN
    SELECT c.id INTO v_id
    FROM public.conversations c
    WHERE c.service_inquiry_id = p_service_inquiry_id
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;

    INSERT INTO public.conversations (participant_low, participant_high, service_inquiry_id)
    VALUES (v_low, v_high, p_service_inquiry_id)
    RETURNING id INTO v_id;

    RETURN v_id;
  END IF;

  SELECT c.id INTO v_id
  FROM public.conversations c
  WHERE c.participant_low = v_low
    AND c.participant_high = v_high
    AND c.job_application_id IS NULL
    AND c.service_inquiry_id IS NULL
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.conversations (participant_low, participant_high)
  VALUES (v_low, v_high)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_touch_conversation ON public.messages;
CREATE TRIGGER messages_touch_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_conversation_last_message();

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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_notify_recipient ON public.messages;
CREATE TRIGGER message_notify_recipient
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_recipient_new_chat_message();

-- RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants select conversations" ON public.conversations;
CREATE POLICY "Participants select conversations"
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (participant_low = auth.uid() OR participant_high = auth.uid());

DROP POLICY IF EXISTS "Participants select messages" ON public.messages;
CREATE POLICY "Participants select messages"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Participants insert messages" ON public.messages;
CREATE POLICY "Participants insert messages"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_participant(conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users manage own conversation reads" ON public.conversation_reads;
CREATE POLICY "Users manage own conversation reads"
  ON public.conversation_reads
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT ON public.conversations TO authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.conversation_reads TO authenticated;

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;
