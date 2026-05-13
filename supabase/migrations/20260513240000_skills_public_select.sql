-- Reference catalog: listing/job forms and browse read approved skills with the anon key.
-- Mirrors public SELECT on categories/subcategories.

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'skills'
      AND policyname = 'skills_select_public'
  ) THEN
    CREATE POLICY skills_select_public ON public.skills
      FOR SELECT
      TO public
      USING (true);
  END IF;
END $$;
