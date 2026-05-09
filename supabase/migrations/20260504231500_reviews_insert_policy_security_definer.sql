-- Make reviews INSERT policy resilient to RLS context by delegating participant
-- validation to a SECURITY DEFINER helper.

DROP POLICY IF EXISTS "Users insert own reviews (job or listing participant)" ON public.reviews;

CREATE OR REPLACE FUNCTION public.can_user_insert_review(
  _completed_job_id uuid,
  _service_inquiry_id uuid,
  _reviewee_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN _completed_job_id IS NOT NULL AND _service_inquiry_id IS NULL THEN
        EXISTS (
          SELECT 1
          FROM public.completed_jobs cj
          JOIN public.hirer_profiles hp ON hp.id = cj.hirer_profile_id
          JOIN public.freelancer_profiles fp ON fp.id = cj.freelancer_profile_id
          WHERE cj.id = _completed_job_id
            AND (
              (hp.user_id = auth.uid() AND fp.user_id = _reviewee_id)
              OR
              (fp.user_id = auth.uid() AND hp.user_id = _reviewee_id)
            )
        )
      WHEN _service_inquiry_id IS NOT NULL AND _completed_job_id IS NULL THEN
        EXISTS (
          SELECT 1
          FROM public.service_inquiries si
          JOIN public.hirer_profiles hp ON hp.id = si.hirer_profile_id
          JOIN public.freelancer_profiles fp ON fp.id = si.freelancer_profile_id
          WHERE si.id = _service_inquiry_id
            AND (
              (hp.user_id = auth.uid() AND fp.user_id = _reviewee_id)
              OR
              (fp.user_id = auth.uid() AND hp.user_id = _reviewee_id)
            )
        )
      ELSE FALSE
    END
$$;

REVOKE ALL ON FUNCTION public.can_user_insert_review(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_user_insert_review(uuid, uuid, uuid) TO authenticated;

CREATE POLICY "Users insert own reviews (job or listing participant)"
  ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND reviewee_id IS NOT NULL
    AND reviewee_id <> reviewer_id
    AND public.can_user_insert_review(completed_job_id, service_inquiry_id, reviewee_id)
  );

COMMENT ON FUNCTION public.can_user_insert_review(uuid, uuid, uuid) IS
  'Validates that auth user can review the opposite participant of either a completed job or a listing inquiry.';
