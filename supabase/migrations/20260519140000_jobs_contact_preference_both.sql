-- Job postings: allow contact_preference = 'both' (email + phone).

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_contact_preference_check;

UPDATE public.jobs
SET contact_preference = 'email'
WHERE contact_preference IS NULL
   OR btrim(contact_preference) = ''
   OR contact_preference NOT IN ('email', 'phone', 'both');

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_contact_preference_check
  CHECK (contact_preference IN ('email', 'phone', 'both'));

COMMENT ON COLUMN public.jobs.contact_preference IS 'How applicants may contact the hirer: email, phone, or both.';
