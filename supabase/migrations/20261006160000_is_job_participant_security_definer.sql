-- Fix: hirer dashboard 500 ("stack depth limit exceeded") on SELECT from jobs.
-- jobs_select calls is_job_participant(), which ran as SECURITY INVOKER and so read
-- job_applications under RLS; ja_select_hirer reads jobs, whose policy calls
-- is_job_participant() again → infinite policy recursion.
-- SECURITY DEFINER breaks the cycle. Safe: it only reports whether auth.uid() itself
-- holds an accepted application on the given job.

CREATE OR REPLACE FUNCTION public.is_job_participant(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.job_applications ja
    JOIN public.freelancer_profiles fp ON fp.id = ja.freelancer_profile_id
    WHERE ja.job_id = p_job_id
      AND fp.user_id = auth.uid()
      AND ja.status = 'accepted'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_job_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_job_participant(uuid) TO anon, authenticated;
