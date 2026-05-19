-- Allow participants to see each other's read timestamps (read receipts) and stream read updates.

DROP POLICY IF EXISTS "Users manage own conversation reads" ON public.conversation_reads;
DROP POLICY IF EXISTS "Participants select conversation reads" ON public.conversation_reads;
DROP POLICY IF EXISTS "Users insert own conversation reads" ON public.conversation_reads;
DROP POLICY IF EXISTS "Users update own conversation reads" ON public.conversation_reads;

CREATE POLICY "Participants select conversation reads"
  ON public.conversation_reads
  FOR SELECT
  TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users insert own conversation reads"
  ON public.conversation_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_conversation_participant(conversation_id, auth.uid())
  );

CREATE POLICY "Users update own conversation reads"
  ON public.conversation_reads
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversation_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_reads;
  END IF;
END $$;
