-- Distinct hirer accounts that viewed this freelancer public profile (logged-in visits only).
-- Required because counting requires joining hirer_profiles / visitor identity — not reliably doable under profiles RLS from the client.

CREATE OR REPLACE FUNCTION public.count_distinct_hirer_visitors_to_freelancer(target_freelancer_profile_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT pv.visitor_user_id)::bigint
  FROM public.profile_visits pv
  WHERE pv.freelancer_profile_id = target_freelancer_profile_id
    AND pv.visitor_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.freelancer_profiles fp
      WHERE fp.id = target_freelancer_profile_id
        AND fp.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.hirer_profiles hp
      WHERE hp.user_id = pv.visitor_user_id
    );
$$;

REVOKE ALL ON FUNCTION public.count_distinct_hirer_visitors_to_freelancer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_distinct_hirer_visitors_to_freelancer(uuid) TO authenticated;

COMMENT ON FUNCTION public.count_distinct_hirer_visitors_to_freelancer(uuid) IS
  'Returns how many distinct hirer accounts (hirer_profiles) visited the given freelancer profile; only the profile owner may get a non-zero result.';
