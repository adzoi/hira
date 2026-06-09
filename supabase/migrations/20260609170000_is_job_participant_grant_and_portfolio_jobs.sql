-- Fix public freelancer portfolio: completed_jobs embed of jobs() fails for anon because
-- jobs_select calls is_job_participant(uuid) without EXECUTE for anon, and completed jobs
-- are not readable via jobs_select for visitors who are not hirer/participant.

CREATE OR REPLACE FUNCTION public.is_job_participant(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
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

DROP POLICY IF EXISTS jobs_select_portfolio_completed ON public.jobs;

CREATE POLICY jobs_select_portfolio_completed
  ON public.jobs
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.completed_jobs cj
      JOIN public.freelancer_profiles fp ON fp.id = cj.freelancer_profile_id
      WHERE cj.job_id = jobs.id
        AND cj.completed_at IS NOT NULL
        AND fp.is_public IS TRUE
        AND fp.show_completed_work_on_public_profile IS TRUE
    )
  );

COMMENT ON POLICY jobs_select_portfolio_completed ON public.jobs IS
  'Public portfolio: read job title/description when linked from a visible completed_jobs row.';

COMMENT ON FUNCTION public.is_job_participant(uuid) IS
  'True when auth.uid() is the accepted freelancer applicant on the job. Used by jobs_select RLS.';
