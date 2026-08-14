-- Chat file attachments: private storage bucket + message metadata columns.
-- Bucket is intentionally NOT public; reads use signed URLs (participant RLS).

-- ---------------------------------------------------------------------------
-- 1. messages columns + constraints
-- ---------------------------------------------------------------------------

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_size_bytes bigint;

ALTER TABLE public.messages
  ALTER COLUMN body DROP NOT NULL;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_body_not_blank;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_has_content_or_attachment,
  ADD CONSTRAINT messages_has_content_or_attachment CHECK (
    (body IS NOT NULL AND char_length(btrim(body)) > 0)
    OR (attachment_url IS NOT NULL AND char_length(btrim(attachment_url)) > 0)
  );

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_attachment_size_max,
  ADD CONSTRAINT messages_attachment_size_max CHECK (
    attachment_size_bytes IS NULL
    OR (
      attachment_size_bytes >= 0
      AND attachment_size_bytes <= 15728640
    )
  );

COMMENT ON COLUMN public.messages.attachment_url IS
  'Storage object path in chat-attachments bucket (not a signed URL).';

-- ---------------------------------------------------------------------------
-- 2. Private storage bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  15728640,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Path layout: {conversation_id}/{message_id}/{filename}
-- SELECT / INSERT / DELETE only for conversation participants.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'chat_attachments_participant_select'
  ) THEN
    CREATE POLICY chat_attachments_participant_select
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'chat-attachments'
        AND public.is_conversation_participant(
          NULLIF(split_part(name, '/', 1), '')::uuid,
          auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'chat_attachments_participant_insert'
  ) THEN
    CREATE POLICY chat_attachments_participant_insert
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'chat-attachments'
        AND public.is_conversation_participant(
          NULLIF(split_part(name, '/', 1), '')::uuid,
          auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'chat_attachments_participant_delete'
  ) THEN
    CREATE POLICY chat_attachments_participant_delete
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'chat-attachments'
        AND public.is_conversation_participant(
          NULLIF(split_part(name, '/', 1), '')::uuid,
          auth.uid()
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Inbox preview + realtime broadcast for attachment-only messages
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_chat_inbox_message_stats()
RETURNS TABLE (
  conversation_id uuid,
  unread_count bigint,
  last_body text,
  last_created_at timestamptz,
  last_sender_id uuid
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id AS conversation_id,
    COALESCE(u.cnt, 0)::bigint AS unread_count,
    CASE
      WHEN lm.body IS NOT NULL AND char_length(btrim(lm.body)) > 0 THEN lm.body
      WHEN lm.attachment_url IS NOT NULL THEN
        'Sent a file: ' || COALESCE(NULLIF(btrim(lm.attachment_name), ''), 'file')
      ELSE NULL
    END AS last_body,
    lm.created_at AS last_created_at,
    lm.sender_id AS last_sender_id
  FROM public.conversations c
  LEFT JOIN LATERAL (
    SELECT m.body, m.attachment_url, m.attachment_name, m.created_at, m.sender_id
    FROM public.messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS cnt
    FROM public.messages m
    WHERE m.conversation_id = c.id
      AND m.sender_id <> auth.uid()
      AND m.created_at > COALESCE(
        (
          SELECT cr.last_read_at
          FROM public.conversation_reads cr
          WHERE cr.conversation_id = c.id
            AND cr.user_id = auth.uid()
        ),
        '-infinity'::timestamptz
      )
  ) u ON true
  WHERE c.participant_low = auth.uid() OR c.participant_high = auth.uid();
$$;

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
  v_body text;
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
    v_preview := left(btrim(NEW.body), 120);
    IF char_length(btrim(NEW.body)) > 120 THEN
      v_preview := v_preview || '…';
    END IF;
  ELSE
    v_body := 'Sent a file: ' || COALESCE(NULLIF(btrim(NEW.attachment_name), ''), 'file');
    v_preview := v_body;
  END IF;

  BEGIN
    PERFORM realtime.send(
      jsonb_build_object(
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
