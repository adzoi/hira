-- Harden get_or_create_conversation: verify application/inquiry participation.
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
  v_freelancer_user uuid;
  v_hirer_user uuid;
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
    SELECT fp.user_id, hp.user_id
    INTO v_freelancer_user, v_hirer_user
    FROM public.job_applications ja
    INNER JOIN public.freelancer_profiles fp ON fp.id = ja.freelancer_profile_id
    INNER JOIN public.jobs j ON j.id = ja.job_id
    INNER JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
    WHERE ja.id = p_job_application_id;

    IF v_freelancer_user IS NULL OR v_hirer_user IS NULL THEN
      RAISE EXCEPTION 'Job application not found';
    END IF;

    IF v_me NOT IN (v_freelancer_user, v_hirer_user) THEN
      RAISE EXCEPTION 'Not authorized for this application';
    END IF;

    IF p_other_user_id NOT IN (v_freelancer_user, v_hirer_user) THEN
      RAISE EXCEPTION 'Invalid conversation participant';
    END IF;

    SELECT c.id INTO v_id
    FROM public.conversations c
    WHERE c.job_application_id = p_job_application_id
      AND v_me IN (c.participant_low, c.participant_high)
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
    SELECT fp.user_id, hp.user_id
    INTO v_freelancer_user, v_hirer_user
    FROM public.service_inquiries si
    INNER JOIN public.freelancer_profiles fp ON fp.id = si.freelancer_profile_id
    INNER JOIN public.hirer_profiles hp ON hp.id = si.hirer_profile_id
    WHERE si.id = p_service_inquiry_id;

    IF v_freelancer_user IS NULL OR v_hirer_user IS NULL THEN
      RAISE EXCEPTION 'Service inquiry not found';
    END IF;

    IF v_me NOT IN (v_freelancer_user, v_hirer_user) THEN
      RAISE EXCEPTION 'Not authorized for this inquiry';
    END IF;

    IF p_other_user_id NOT IN (v_freelancer_user, v_hirer_user) THEN
      RAISE EXCEPTION 'Invalid conversation participant';
    END IF;

    SELECT c.id INTO v_id
    FROM public.conversations c
    WHERE c.service_inquiry_id = p_service_inquiry_id
      AND v_me IN (c.participant_low, c.participant_high)
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

-- Authorized status notifications (replaces direct client INSERT).
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
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_target_user_id IS NULL OR p_target_user_id = v_me THEN
    RAISE EXCEPTION 'Invalid target user';
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

  INSERT INTO public.notifications (user_id, title, body, link, type, is_read, payload)
  VALUES (
    p_target_user_id,
    btrim(p_title),
    btrim(p_body),
    v_link,
    COALESCE(NULLIF(btrim(p_type), ''), 'status_update'),
    false,
    '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_status_notification(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_status_notification(uuid, text, text, text, text) TO authenticated;
