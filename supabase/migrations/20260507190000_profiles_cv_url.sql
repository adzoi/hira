-- Public PDF CV link on freelancer profile (storage `cvs` bucket + profiles.cv_url)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cv_url text;

COMMENT ON COLUMN public.profiles.cv_url IS
  'Public URL for uploaded CV PDF in storage; nullable when no CV is attached.';
