-- Add view counters for freelancer listings and safe increment RPCs.

ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_job_views(p_job_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_count bigint := 0;
BEGIN
  UPDATE public.jobs
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = p_job_id
  RETURNING views_count INTO next_count;

  RETURN COALESCE(next_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_service_views(p_service_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_count bigint := 0;
BEGIN
  UPDATE public.services
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = p_service_id
  RETURNING views_count INTO next_count;

  RETURN COALESCE(next_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_job_views(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_service_views(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_job_views(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_service_views(uuid) TO anon, authenticated;
