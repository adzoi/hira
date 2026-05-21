-- Efficient per-conversation latest message + unread counts (avoids loading all messages client-side).

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
    lm.body AS last_body,
    lm.created_at AS last_created_at,
    lm.sender_id AS last_sender_id
  FROM public.conversations c
  LEFT JOIN LATERAL (
    SELECT m.body, m.created_at, m.sender_id
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

REVOKE ALL ON FUNCTION public.get_chat_inbox_message_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_inbox_message_stats() TO authenticated;
