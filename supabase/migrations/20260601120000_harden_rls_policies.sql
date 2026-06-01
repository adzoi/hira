-- Harden RLS: fix clear ❌ issues identified in supabase/rls-audit.md (2026-06-01).
-- Does not change public read policies on jobs/listings beyond scoped freelancer sub-resources.
-- Idempotent: safe to re-run if a prior push failed partway or policies were pre-applied.

-- ── profiles: stop anon PII scrape; scope directory reads ─────────────────────
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id,
  user_type,
  full_name,
  avatar_url,
  city,
  is_verified,
  is_active,
  is_online,
  member_since,
  created_at,
  updated_at
) ON public.profiles TO anon;

DROP POLICY IF EXISTS profiles_select_public ON public.profiles;
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
  'Directory fields for public freelancers, hirers, and own row. Anon lacks SELECT on email/phone/cv_url columns.';

-- ── profile_visits: remove permissive INSERT bypass ───────────────────────────
DROP POLICY IF EXISTS profile_visits_insert ON public.profile_visits;

-- ── skills: remove unapproved-skills bypass ─────────────────────────────────
DROP POLICY IF EXISTS skills_select_public ON public.skills;

-- ── freelancer sub-resources: hide private profile data ───────────────────────
DROP POLICY IF EXISTS fs_select_public ON public.freelancer_skills;
DROP POLICY IF EXISTS fs_select_public_or_owner ON public.freelancer_skills;

CREATE POLICY fs_select_public_or_owner
  ON public.freelancer_skills
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.freelancer_profiles fp
      WHERE fp.id = freelancer_skills.freelancer_profile_id
        AND (fp.is_public IS TRUE OR fp.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS exp_select ON public.experience;
DROP POLICY IF EXISTS exp_select_public_or_owner ON public.experience;

CREATE POLICY exp_select_public_or_owner
  ON public.experience
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.freelancer_profiles fp
      WHERE fp.id = experience.freelancer_profile_id
        AND (fp.is_public IS TRUE OR fp.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS portfolio_select ON public.portfolio_items;
DROP POLICY IF EXISTS portfolio_select_public_or_owner ON public.portfolio_items;

CREATE POLICY portfolio_select_public_or_owner
  ON public.portfolio_items
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.freelancer_profiles fp
      WHERE fp.id = portfolio_items.freelancer_profile_id
        AND (fp.is_public IS TRUE OR fp.user_id = auth.uid())
    )
  );

-- ── storage: drop legacy avatar INSERT without owner folder check ─────────────
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
