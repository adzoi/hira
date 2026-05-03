-- Hirer workflow: accept/reject applications, mark job in progress / completed,
-- insert completed_jobs and reviews. Adjust or drop policies if yours already exist.

-- job_applications: hirer updates rows for jobs they own
DROP POLICY IF EXISTS "Hirers manage applications on own jobs" ON public.job_applications;
CREATE POLICY "Hirers manage applications on own jobs"
  ON public.job_applications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      INNER JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
      WHERE j.id = job_applications.job_id
        AND hp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      INNER JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
      WHERE j.id = job_applications.job_id
        AND hp.user_id = auth.uid()
    )
  );

-- jobs: hirer updates own job rows (status → in_progress / completed)
DROP POLICY IF EXISTS "Hirers update own jobs" ON public.jobs;
CREATE POLICY "Hirers update own jobs"
  ON public.jobs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = jobs.hirer_profile_id AND hp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = jobs.hirer_profile_id AND hp.user_id = auth.uid()
    )
  );

-- completed_jobs: hirer inserts a completion record for their job
DROP POLICY IF EXISTS "Hirers insert completed_jobs for own jobs" ON public.completed_jobs;
CREATE POLICY "Hirers insert completed_jobs for own jobs"
  ON public.completed_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.jobs j
      INNER JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
      WHERE j.id = completed_jobs.job_id
        AND hp.user_id = auth.uid()
        AND j.hirer_profile_id = completed_jobs.hirer_profile_id
    )
  );

-- reviews: hirer inserts review where they are the reviewer (profile id = auth.uid())
DROP POLICY IF EXISTS "Users insert own reviews" ON public.reviews;
CREATE POLICY "Users insert own reviews"
  ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (reviewer_id = auth.uid());

-- Optional: allow hirer to read completed_jobs for own jobs (if not already covered)
DROP POLICY IF EXISTS "Hirers select completed_jobs for own jobs" ON public.completed_jobs;
CREATE POLICY "Hirers select completed_jobs for own jobs"
  ON public.completed_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = completed_jobs.hirer_profile_id AND hp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = completed_jobs.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Hirers manage applications on own jobs" ON public.job_applications IS
  'Allows job owner to accept/reject applications via client UPDATE.';

-- reviews: read reviews where you are reviewer or reviewee (duplicate check, profile pages)
DROP POLICY IF EXISTS "Users read relevant reviews" ON public.reviews;
CREATE POLICY "Users read relevant reviews"
  ON public.reviews
  FOR SELECT
  TO authenticated
  USING (reviewer_id = auth.uid() OR reviewee_id = auth.uid());
