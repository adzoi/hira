-- Public portfolio: anon/authenticated SELECT on completed_jobs (OR-combines with existing hirer/freelancer own-row policies).

DROP POLICY IF EXISTS "Anyone reads completed_jobs for public freelancers" ON public.completed_jobs;
DROP POLICY IF EXISTS "cj_select_public_completed_for_is_public_fps" ON public.completed_jobs;

CREATE POLICY "cj_select_public_completed_for_is_public_fps"
  ON public.completed_jobs
  FOR SELECT
  TO anon, authenticated
  USING (
    completed_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.freelancer_profiles fp
      WHERE fp.id = completed_jobs.freelancer_profile_id
        AND fp.is_public IS TRUE
    )
  );

COMMENT ON POLICY "cj_select_public_completed_for_is_public_fps" ON public.completed_jobs IS
  'Portfolio: anon/auth can SELECT completed_jobs for public freelancer profiles (policies combine with OR).';

-- SECURITY DEFINER RPC: listing titles only (no service_inquiries.message).

CREATE OR REPLACE FUNCTION public.public_freelancer_completed_service_titles(p_freelancer_profile_id uuid)
RETURNS TABLE(service_title text, completed_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(NULLIF(trim(s.title), ''), 'სერვისი') AS service_title,
         si.completed_at
  FROM public.service_inquiries si
  JOIN public.freelancer_profiles fp ON fp.id = si.freelancer_profile_id
  JOIN public.services s ON s.id = si.service_id
  WHERE si.freelancer_profile_id = p_freelancer_profile_id
    AND si.status = 'completed'
    AND si.completed_at IS NOT NULL
    AND fp.is_public IS TRUE
  ORDER BY si.completed_at DESC
  LIMIT 40;
$$;

REVOKE ALL ON FUNCTION public.public_freelancer_completed_service_titles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_freelancer_completed_service_titles(uuid) TO anon, authenticated;
