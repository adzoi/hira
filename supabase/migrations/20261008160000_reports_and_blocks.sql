-- Report content/users and block users.
-- Blocks are enforced server-side: neither side can start a conversation or send a message.
-- Reports reuse the baseline public.reports table (unused until now) for moderators to review.

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Blocker reads own blocks" ON public.user_blocks;
CREATE POLICY "Blocker reads own blocks" ON public.user_blocks
  FOR SELECT TO authenticated
  USING (blocker_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Blocker creates own blocks" ON public.user_blocks;
CREATE POLICY "Blocker creates own blocks" ON public.user_blocks
  FOR INSERT TO authenticated
  WITH CHECK (blocker_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Blocker removes own blocks" ON public.user_blocks;
CREATE POLICY "Blocker removes own blocks" ON public.user_blocks
  FOR DELETE TO authenticated
  USING (blocker_id = (SELECT auth.uid()));

REVOKE ALL ON public.user_blocks FROM anon;
GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;

CREATE OR REPLACE FUNCTION public.users_blocked_between(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id = p_a AND b.blocked_id = p_b)
       OR (b.blocker_id = p_b AND b.blocked_id = p_a)
  );
$$;

REVOKE ALL ON FUNCTION public.users_blocked_between(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.prevent_blocked_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.users_blocked_between(NEW.participant_low, NEW.participant_high) THEN
    RAISE EXCEPTION 'USER_BLOCKED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_prevent_blocked ON public.conversations;
CREATE TRIGGER conversations_prevent_blocked
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_blocked_conversation();

CREATE OR REPLACE FUNCTION public.prevent_blocked_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_other uuid;
BEGIN
  SELECT CASE WHEN c.participant_low = NEW.sender_id THEN c.participant_high ELSE c.participant_low END
  INTO v_other
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF v_other IS NOT NULL AND public.users_blocked_between(NEW.sender_id, v_other) THEN
    RAISE EXCEPTION 'USER_BLOCKED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- Named to sort before the other BEFORE INSERT triggers, so blocked sends fail fast.
DROP TRIGGER IF EXISTS messages_a_prevent_blocked ON public.messages;
CREATE TRIGGER messages_a_prevent_blocked
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.prevent_blocked_message();

-- Widen the baseline reports table to everything users can report.
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('profile', 'review', 'user', 'job', 'service', 'forum_post', 'message'));

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reason_check;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_reason_check
  CHECK (reason IN ('spam', 'scam', 'inappropriate', 'harassment', 'fake', 'other'));

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_details_length;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_details_length CHECK (details IS NULL OR char_length(details) <= 1000);

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_one_per_target;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_one_per_target UNIQUE (reporter_id, target_type, target_id);

CREATE INDEX IF NOT EXISTS reports_pending_idx
  ON public.reports (created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS reports_target_idx
  ON public.reports (target_type, target_id);

-- Only signed-in users report, only as themselves, and only new (pending) reports.
DROP POLICY IF EXISTS reports_insert ON public.reports;
CREATE POLICY reports_insert ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (SELECT auth.uid()) AND status = 'pending');

DROP POLICY IF EXISTS reports_select_own ON public.reports;
CREATE POLICY reports_select_own ON public.reports
  FOR SELECT TO authenticated
  USING (reporter_id = (SELECT auth.uid()));

REVOKE ALL ON public.reports FROM anon;
GRANT SELECT, INSERT ON public.reports TO authenticated;

CREATE OR REPLACE FUNCTION public.rate_limit_reports_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*)::bigint INTO v_count
  FROM public.reports r
  WHERE r.reporter_id = NEW.reporter_id
    AND r.created_at > now() - interval '1 hour';

  PERFORM public.assert_insert_rate_limit(v_count, 10);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reports_insert_rate_limit ON public.reports;
CREATE TRIGGER reports_insert_rate_limit
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_reports_insert();
