-- Education entries for freelancer profiles (ჩემს შესახებ)
CREATE TABLE IF NOT EXISTS public.freelancer_education (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_profile_id uuid NOT NULL REFERENCES public.freelancer_profiles (id) ON DELETE CASCADE,
  institution text NOT NULL,
  degree_level text NOT NULL,
  field_of_study text,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT freelancer_education_degree_level_check CHECK (
    degree_level IN ('bachelor', 'master', 'doctorate', 'diploma', 'vocational', 'other')
  )
);

CREATE INDEX IF NOT EXISTS freelancer_education_freelancer_profile_id_idx
  ON public.freelancer_education (freelancer_profile_id);

ALTER TABLE public.freelancer_education ENABLE ROW LEVEL SECURITY;

CREATE POLICY "freelancer_education_select_public_or_owner"
ON public.freelancer_education
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.freelancer_profiles fp
    WHERE fp.id = freelancer_education.freelancer_profile_id
      AND (fp.is_public = true OR fp.user_id = auth.uid())
  )
);

CREATE POLICY "freelancer_education_insert_own"
ON public.freelancer_education
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.freelancer_profiles fp
    WHERE fp.id = freelancer_education.freelancer_profile_id
      AND fp.user_id = auth.uid()
  )
);

CREATE POLICY "freelancer_education_update_own"
ON public.freelancer_education
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.freelancer_profiles fp
    WHERE fp.id = freelancer_education.freelancer_profile_id
      AND fp.user_id = auth.uid()
  )
);

CREATE POLICY "freelancer_education_delete_own"
ON public.freelancer_education
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.freelancer_profiles fp
    WHERE fp.id = freelancer_education.freelancer_profile_id
      AND fp.user_id = auth.uid()
  )
);
