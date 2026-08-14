-- Server-side insert rate limits for direct client → PostgREST writes.
-- Limits mirror supabase/functions/_shared/rateLimit.ts CONTENT_RATE_LIMITS.

CREATE OR REPLACE FUNCTION public.assert_insert_rate_limit(p_count bigint, p_max int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_count >= p_max THEN
    RAISE EXCEPTION 'Too many requests'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_insert_rate_limit(bigint, int) FROM PUBLIC;

-- jobs: 20 / hour per hirer user
CREATE OR REPLACE FUNCTION public.rate_limit_jobs_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*)::bigint INTO v_count
  FROM public.jobs j
  INNER JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
  WHERE hp.user_id = auth.uid()
    AND j.created_at > now() - interval '1 hour';

  PERFORM public.assert_insert_rate_limit(v_count, 20);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_insert_rate_limit ON public.jobs;
CREATE TRIGGER jobs_insert_rate_limit
  BEFORE INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.rate_limit_jobs_insert();

-- services: 20 / hour per freelancer user
CREATE OR REPLACE FUNCTION public.rate_limit_services_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*)::bigint INTO v_count
  FROM public.services s
  INNER JOIN public.freelancer_profiles fp ON fp.id = s.freelancer_profile_id
  WHERE fp.user_id = auth.uid()
    AND s.created_at > now() - interval '1 hour';

  PERFORM public.assert_insert_rate_limit(v_count, 20);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS services_insert_rate_limit ON public.services;
CREATE TRIGGER services_insert_rate_limit
  BEFORE INSERT ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.rate_limit_services_insert();

-- messages: 5 / minute per conversation + 30 / minute globally per sender
CREATE OR REPLACE FUNCTION public.rate_limit_messages_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_count bigint;
  v_user_count bigint;
BEGIN
  SELECT COUNT(*)::bigint INTO v_conv_count
  FROM public.messages m
  WHERE m.conversation_id = NEW.conversation_id
    AND m.sender_id = NEW.sender_id
    AND m.created_at > now() - interval '1 minute';

  PERFORM public.assert_insert_rate_limit(v_conv_count, 5);

  SELECT COUNT(*)::bigint INTO v_user_count
  FROM public.messages m
  WHERE m.sender_id = NEW.sender_id
    AND m.created_at > now() - interval '1 minute';

  PERFORM public.assert_insert_rate_limit(v_user_count, 30);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_insert_rate_limit ON public.messages;
CREATE TRIGGER messages_insert_rate_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.rate_limit_messages_insert();

-- service_inquiries: 20 / hour per hirer user
CREATE OR REPLACE FUNCTION public.rate_limit_service_inquiries_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*)::bigint INTO v_count
  FROM public.service_inquiries si
  INNER JOIN public.hirer_profiles hp ON hp.id = si.hirer_profile_id
  WHERE hp.user_id = auth.uid()
    AND si.created_at > now() - interval '1 hour';

  PERFORM public.assert_insert_rate_limit(v_count, 20);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_inquiries_insert_rate_limit ON public.service_inquiries;
CREATE TRIGGER service_inquiries_insert_rate_limit
  BEFORE INSERT ON public.service_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.rate_limit_service_inquiries_insert();

-- job_applications: 30 / hour per freelancer user
CREATE OR REPLACE FUNCTION public.rate_limit_job_applications_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*)::bigint INTO v_count
  FROM public.job_applications ja
  INNER JOIN public.freelancer_profiles fp ON fp.id = ja.freelancer_profile_id
  WHERE fp.user_id = auth.uid()
    AND ja.created_at > now() - interval '1 hour';

  PERFORM public.assert_insert_rate_limit(v_count, 30);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_applications_insert_rate_limit ON public.job_applications;
CREATE TRIGGER job_applications_insert_rate_limit
  BEFORE INSERT ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.rate_limit_job_applications_insert();

-- forum_posts: 20 / hour per author
CREATE OR REPLACE FUNCTION public.rate_limit_forum_posts_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*)::bigint INTO v_count
  FROM public.forum_posts fp
  WHERE fp.author_id = NEW.author_id
    AND fp.created_at > now() - interval '1 hour';

  PERFORM public.assert_insert_rate_limit(v_count, 20);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forum_posts_insert_rate_limit ON public.forum_posts;
CREATE TRIGGER forum_posts_insert_rate_limit
  BEFORE INSERT ON public.forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.rate_limit_forum_posts_insert();

-- forum_comments: 60 / hour per author
CREATE OR REPLACE FUNCTION public.rate_limit_forum_comments_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*)::bigint INTO v_count
  FROM public.forum_comments fc
  WHERE fc.author_id = NEW.author_id
    AND fc.created_at > now() - interval '1 hour';

  PERFORM public.assert_insert_rate_limit(v_count, 60);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forum_comments_insert_rate_limit ON public.forum_comments;
CREATE TRIGGER forum_comments_insert_rate_limit
  BEFORE INSERT ON public.forum_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.rate_limit_forum_comments_insert();
