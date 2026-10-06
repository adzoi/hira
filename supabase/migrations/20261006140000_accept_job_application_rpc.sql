-- Hirer "accept application" as one transaction.
-- The dashboard used to run separate client writes (accept application → bump accepted_count /
-- close job → reject other pending). A failed or zero-row first step still closed the job, so the
-- listing vanished while the applicant stayed pending.

CREATE OR REPLACE FUNCTION public.accept_job_application(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
  v_status text;
  v_accepted integer;
  v_vacancies integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT ja.job_id, ja.status
  INTO v_job_id, v_status
  FROM public.job_applications ja
  WHERE ja.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT j.accepted_count, GREATEST(1, j.vacancies)
  INTO v_accepted, v_vacancies
  FROM public.jobs j
  JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
  WHERE j.id = v_job_id
    AND hp.user_id = auth.uid()
  FOR UPDATE OF j;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the job owner can accept applications' USING ERRCODE = '42501';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Application is no longer pending' USING ERRCODE = 'P0001';
  END IF;

  IF v_accepted >= v_vacancies THEN
    RAISE EXCEPTION 'All vacancies for this job are already filled' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.job_applications SET status = 'accepted' WHERE id = p_application_id;

  UPDATE public.jobs
  SET accepted_count = v_accepted + 1,
      status = CASE WHEN v_accepted + 1 >= v_vacancies THEN 'closed' ELSE status END
  WHERE id = v_job_id;

  IF v_accepted + 1 >= v_vacancies THEN
    UPDATE public.job_applications
    SET status = 'rejected'
    WHERE job_id = v_job_id
      AND id <> p_application_id
      AND status = 'pending';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_job_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_job_application(uuid) TO authenticated;
