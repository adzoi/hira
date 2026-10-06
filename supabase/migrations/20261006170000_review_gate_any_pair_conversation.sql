-- Fix: "Review blocked: no conversation linked to this job application or listing inquiry".
-- Hirer and freelancer usually chat from the profile/inbox, which creates an unlinked
-- conversation; a job-linked one only exists if someone opened chat from the application.
-- The anti-fraud gate now counts messages across every conversation between the two parties
-- (linked or not) sent before completion. Thresholds are unchanged.
--
-- Also repairs applications left 'accepted' after their hire was completed (the hirer's
-- "complete" flow aborted before the application update while jobs SELECT was recursing).

CREATE OR REPLACE FUNCTION public.review_requires_conversation_messages(
  p_completed_job_id uuid,
  p_service_inquiry_id uuid,
  p_min_messages integer DEFAULT 3
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hirer_user uuid;
  v_freelancer_user uuid;
  v_completion_at timestamptz;
  v_message_count integer;
  v_distinct_senders integer;
BEGIN
  IF p_completed_job_id IS NOT NULL AND p_service_inquiry_id IS NULL THEN
    SELECT hp.user_id, fp.user_id, COALESCE(cj.completed_at, cj.created_at)
    INTO v_hirer_user, v_freelancer_user, v_completion_at
    FROM public.completed_jobs cj
    INNER JOIN public.hirer_profiles hp ON hp.id = cj.hirer_profile_id
    INNER JOIN public.freelancer_profiles fp ON fp.id = cj.freelancer_profile_id
    WHERE cj.id = p_completed_job_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Completed job not found for review validation';
    END IF;
  ELSIF p_service_inquiry_id IS NOT NULL AND p_completed_job_id IS NULL THEN
    SELECT hp.user_id, fp.user_id, COALESCE(si.completed_at, si.updated_at, si.created_at)
    INTO v_hirer_user, v_freelancer_user, v_completion_at
    FROM public.service_inquiries si
    INNER JOIN public.hirer_profiles hp ON hp.id = si.hirer_profile_id
    INNER JOIN public.freelancer_profiles fp ON fp.id = si.freelancer_profile_id
    WHERE si.id = p_service_inquiry_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Service inquiry not found for review validation';
    END IF;
  ELSE
    RETURN FALSE;
  END IF;

  SELECT COUNT(*)::integer, COUNT(DISTINCT m.sender_id)::integer
  INTO v_message_count, v_distinct_senders
  FROM public.conversations c
  INNER JOIN public.messages m ON m.conversation_id = c.id
  WHERE c.participant_low = LEAST(v_hirer_user, v_freelancer_user)
    AND c.participant_high = GREATEST(v_hirer_user, v_freelancer_user)
    AND m.created_at <= v_completion_at;

  IF v_message_count < p_min_messages THEN
    RAISE EXCEPTION
      'Review blocked: at least % messages must be exchanged in chat before completion (found %)',
      p_min_messages, v_message_count;
  END IF;

  IF v_distinct_senders < 2 THEN
    RAISE EXCEPTION
      'Review blocked: chat must include messages from both parties before completion';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.review_requires_conversation_messages(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_requires_conversation_messages(uuid, uuid, integer) TO authenticated;

-- Data repair: completed hire whose application never left 'accepted'.
UPDATE public.job_applications ja
SET status = 'completed'
FROM public.completed_jobs cj
WHERE cj.job_id = ja.job_id
  AND cj.freelancer_profile_id = ja.freelancer_profile_id
  AND ja.status = 'accepted';
