-- Public-safe applicant totals per job (counts only, no applicant details).
CREATE OR REPLACE FUNCTION public.public_job_application_counts(p_job_ids uuid[])
RETURNS TABLE(job_id uuid, applicants_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ja.job_id, COUNT(*)::bigint AS applicants_count
  FROM public.job_applications AS ja
  WHERE ja.job_id = ANY(p_job_ids)
  GROUP BY ja.job_id
$$;

REVOKE ALL ON FUNCTION public.public_job_application_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_job_application_counts(uuid[]) TO anon, authenticated;
