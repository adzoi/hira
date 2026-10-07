-- 20261005150000 reset average_rating / average_rating_given to NULL on insert, but both
-- columns are NOT NULL DEFAULT 0, so every new freelancer and hirer profile failed to save.

CREATE OR REPLACE FUNCTION public.protect_freelancer_profile_system_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.average_rating := 0;
    NEW.total_reviews_count := 0;
    NEW.completed_jobs_count := 0;
    NEW.is_vip := false;
    NEW.vip_tier := NULL;
    NEW.vip_expires_at := NULL;
  ELSE
    NEW.average_rating := OLD.average_rating;
    NEW.total_reviews_count := OLD.total_reviews_count;
    NEW.completed_jobs_count := OLD.completed_jobs_count;
    NEW.is_vip := OLD.is_vip;
    NEW.vip_tier := OLD.vip_tier;
    NEW.vip_expires_at := OLD.vip_expires_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_hirer_profile_system_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.jobs_posted_count := 0;
    NEW.completed_jobs_count := 0;
    NEW.average_rating_given := 0;
  ELSE
    NEW.jobs_posted_count := OLD.jobs_posted_count;
    NEW.completed_jobs_count := OLD.completed_jobs_count;
    NEW.average_rating_given := OLD.average_rating_given;
  END IF;
  RETURN NEW;
END;
$$;

