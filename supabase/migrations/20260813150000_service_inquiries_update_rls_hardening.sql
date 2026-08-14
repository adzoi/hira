-- Close fail-open gap: service_inquiries UPDATE policies must pin inquiry identity
-- (service_id, hirer_profile_id, freelancer_profile_id) and drop legacy duplicates
-- without explicit WITH CHECK (si_update_hirer / si_update_freelancer).

CREATE OR REPLACE FUNCTION public.service_inquiry_identity_unchanged(
  p_id uuid,
  p_hirer_profile_id uuid,
  p_freelancer_profile_id uuid,
  p_service_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.service_inquiries si
    WHERE si.id = p_id
      AND si.hirer_profile_id = p_hirer_profile_id
      AND si.freelancer_profile_id = p_freelancer_profile_id
      AND si.service_id = p_service_id
  );
$$;

REVOKE ALL ON FUNCTION public.service_inquiry_identity_unchanged(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_inquiry_identity_unchanged(uuid, uuid, uuid, uuid) TO authenticated;

-- Legacy public-role UPDATE policies: USING only, no explicit WITH CHECK (OR-combined with scoped policies).
DROP POLICY IF EXISTS si_update_hirer ON public.service_inquiries;
DROP POLICY IF EXISTS si_update_freelancer ON public.service_inquiries;

DROP POLICY IF EXISTS si_hirer_update_own ON public.service_inquiries;
CREATE POLICY si_hirer_update_own
  ON public.service_inquiries FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = service_inquiries.hirer_profile_id AND hp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.service_inquiry_identity_unchanged(
      id, hirer_profile_id, freelancer_profile_id, service_id
    )
    AND EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = service_inquiries.hirer_profile_id AND hp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS si_freelancer_update_own ON public.service_inquiries;
CREATE POLICY si_freelancer_update_own
  ON public.service_inquiries FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = service_inquiries.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.service_inquiry_identity_unchanged(
      id, hirer_profile_id, freelancer_profile_id, service_id
    )
    AND EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = service_inquiries.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );
