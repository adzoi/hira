-- Repair profiles SELECT after partial harden_rls apply: authenticated users must read their own row.
-- Remote had profiles_select_directory scoped to anon only, without auth.uid() = id.

DROP POLICY IF EXISTS profiles_select_directory ON public.profiles;

CREATE POLICY profiles_select_directory
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.freelancer_profiles fp
      WHERE fp.user_id = profiles.id
        AND fp.is_public IS TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM public.hirer_profiles hp
      WHERE hp.user_id = profiles.id
    )
  );

COMMENT ON POLICY profiles_select_directory ON public.profiles IS
  'Own row for authenticated; directory fields for public freelancers and hirers. Anon column grants hide PII.';
