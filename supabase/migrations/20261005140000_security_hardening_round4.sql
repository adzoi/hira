-- Security hardening (audit 2026-10-05, round 4).
--   A. forum_posts_set_updated_at: pin search_path (advisor 0011).
--   B. send_status_notification: allowlist notification types and cap volume per recipient.

-- ── A. Pinned search_path ─────────────────────────────────────────────────────
ALTER FUNCTION public.forum_posts_set_updated_at() SET search_path = public;

-- ── B. send_status_notification ──────────────────────────────────────────────
-- Any past counterparty could send unlimited notifications with an arbitrary `type`.
CREATE OR REPLACE FUNCTION public.send_status_notification(
  p_target_user_id uuid,
  p_title text,
  p_body text,
  p_link text,
  p_type text DEFAULT 'status_update'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_link text := btrim(COALESCE(p_link, ''));
  v_type text := COALESCE(NULLIF(btrim(p_type), ''), 'status_update');
  v_recent bigint;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_target_user_id IS NULL OR p_target_user_id = v_me THEN
    RAISE EXCEPTION 'Invalid target user';
  END IF;

  IF v_type NOT IN ('status_update', 'job_application_status', 'listing_inquiry_status') THEN
    RAISE EXCEPTION 'Invalid type';
  END IF;

  IF v_link = '' OR v_link !~ '^/[a-zA-Z0-9/_-]*$' OR v_link LIKE '//%' THEN
    RAISE EXCEPTION 'Invalid link';
  END IF;

  IF char_length(btrim(COALESCE(p_title, ''))) = 0 OR char_length(p_title) > 200 THEN
    RAISE EXCEPTION 'Invalid title';
  END IF;

  IF char_length(btrim(COALESCE(p_body, ''))) = 0 OR char_length(p_body) > 2000 THEN
    RAISE EXCEPTION 'Invalid body';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.service_inquiries si
    INNER JOIN public.freelancer_profiles fp ON fp.id = si.freelancer_profile_id
    INNER JOIN public.hirer_profiles hp ON hp.id = si.hirer_profile_id
    WHERE (fp.user_id = v_me AND hp.user_id = p_target_user_id)
       OR (hp.user_id = v_me AND fp.user_id = p_target_user_id)
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.job_applications ja
    INNER JOIN public.freelancer_profiles fp ON fp.id = ja.freelancer_profile_id
    INNER JOIN public.jobs j ON j.id = ja.job_id
    INNER JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
    WHERE (fp.user_id = v_me AND hp.user_id = p_target_user_id)
       OR (hp.user_id = v_me AND fp.user_id = p_target_user_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- notifications has no sender column; cap client-originated status notifications per recipient.
  SELECT COUNT(*)::bigint INTO v_recent
  FROM public.notifications n
  WHERE n.user_id = p_target_user_id
    AND n.type IN ('status_update', 'job_application_status', 'listing_inquiry_status')
    AND n.created_at > now() - interval '1 hour';
  PERFORM public.assert_insert_rate_limit(v_recent, 30);

  INSERT INTO public.notifications (user_id, title, body, link, type, is_read, payload)
  VALUES (
    p_target_user_id,
    btrim(p_title),
    btrim(p_body),
    v_link,
    v_type,
    false,
    '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_status_notification(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_status_notification(uuid, text, text, text, text) TO authenticated;
