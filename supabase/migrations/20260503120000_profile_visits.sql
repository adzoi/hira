-- Profile visit events (freelancer or hirer public profiles).
-- Apply in Supabase: SQL Editor or `supabase db push`.
--
-- Expectations vs PostgREST:
-- • RLS policies decide *which rows* qualify; GRANT decides whether anon/authenticated
--   may *attempt* insert/select at all. Include explicit GRANTs below.
-- • SELECT: only authenticated users with a SELECT policy — owners see visits to profiles
--   where freelancer_profiles.user_id / hirer_profiles.user_id = auth.uid().
--   Anonymous clients can INSERT but have no SELECT policy → they cannot read rows
--   (grant SELECT to anon is optional; omitting avoids implying public read access).
-- • INSERT: anon + authenticated may insert valid rows per CHECK + FK constraints.
--
-- Sanity check (SQL Editor):
--   select relrowsecurity from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relname = 'profile_visits';
--
-- Requires freelancer_profiles(user_id) and hirer_profiles(user_id) referencing auth users.

CREATE TABLE IF NOT EXISTS public.profile_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  visitor_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  freelancer_profile_id UUID REFERENCES public.freelancer_profiles (id) ON DELETE CASCADE,
  hirer_profile_id UUID REFERENCES public.hirer_profiles (id) ON DELETE CASCADE,
  CONSTRAINT profile_visits_one_target CHECK (
    (freelancer_profile_id IS NOT NULL AND hirer_profile_id IS NULL)
    OR (freelancer_profile_id IS NULL AND hirer_profile_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS profile_visits_freelancer_created_idx
  ON public.profile_visits (freelancer_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS profile_visits_hirer_created_idx
  ON public.profile_visits (hirer_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS profile_visits_visitor_created_idx
  ON public.profile_visits (visitor_user_id, created_at DESC)
  WHERE visitor_user_id IS NOT NULL;

ALTER TABLE public.profile_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert a profile visit"
  ON public.profile_visits
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Owners can select visits to their profiles"
  ON public.profile_visits
  FOR SELECT
  TO authenticated
  USING (
    freelancer_profile_id IN (
      SELECT fp.id FROM public.freelancer_profiles fp WHERE fp.user_id = auth.uid()
    )
    OR hirer_profile_id IN (
      SELECT hp.id FROM public.hirer_profiles hp WHERE hp.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.profile_visits IS 'Append-only visits to public freelancer/hirer profile pages';

-- Data API: RLS filters rows; GRANT lets roles use INSERT/SELECT at all via PostgREST.
-- Anonymous visitors can record visits only (INSERT). They have no SELECT policy → no readable rows.
GRANT INSERT ON TABLE public.profile_visits TO anon;
GRANT SELECT, INSERT ON TABLE public.profile_visits TO authenticated;
