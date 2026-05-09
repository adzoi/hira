-- Hirer job postings: multiple freelancer slots (vacancies) and hired count (accepted_count).

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS vacancies integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS accepted_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_vacancies_check;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_accepted_count_check;

ALTER TABLE public.jobs ADD CONSTRAINT jobs_vacancies_check CHECK (vacancies >= 1);
ALTER TABLE public.jobs ADD CONSTRAINT jobs_accepted_count_check CHECK (accepted_count >= 0);

COMMENT ON COLUMN public.jobs.vacancies IS 'How many freelancers can be accepted for this posting.';
COMMENT ON COLUMN public.jobs.accepted_count IS 'Number of freelancers accepted so far.';

-- Align counter with existing accepted / in-flight applications.
UPDATE public.jobs j
SET accepted_count = COALESCE(
    (
      SELECT count(*)::integer
      FROM public.job_applications ja
      WHERE ja.job_id = j.id
        AND ja.status IN ('accepted', 'in_progress', 'freelancer_done', 'hirer_done', 'completed')
    ),
    0,
  );
