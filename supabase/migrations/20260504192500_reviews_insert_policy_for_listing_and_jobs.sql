-- Fix reviews INSERT RLS for both completed_jobs and service_inquiries review flows.

DROP POLICY IF EXISTS "Users insert own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users insert own reviews (job or listing participant)" ON public.reviews;

CREATE POLICY "Users insert own reviews (job or listing participant)"
  ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND (
      -- Job-based review flow (completed_jobs).
      (
        completed_job_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.completed_jobs cj
          LEFT JOIN public.hirer_profiles hp ON hp.id = cj.hirer_profile_id
          LEFT JOIN public.freelancer_profiles fp ON fp.id = cj.freelancer_profile_id
          WHERE cj.id = reviews.completed_job_id
            AND (
              (hp.user_id = auth.uid() AND reviews.reviewee_id = fp.user_id)
              OR
              (fp.user_id = auth.uid() AND reviews.reviewee_id = hp.user_id)
            )
        )
      )
      OR
      -- Listing-offer review flow (service_inquiries).
      (
        service_inquiry_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.service_inquiries si
          LEFT JOIN public.hirer_profiles hp ON hp.id = si.hirer_profile_id
          LEFT JOIN public.freelancer_profiles fp ON fp.id = si.freelancer_profile_id
          WHERE si.id = reviews.service_inquiry_id
            AND (
              (hp.user_id = auth.uid() AND reviews.reviewee_id = fp.user_id)
              OR
              (fp.user_id = auth.uid() AND reviews.reviewee_id = hp.user_id)
            )
        )
      )
    )
  );

COMMENT ON POLICY "Users insert own reviews (job or listing participant)" ON public.reviews IS
  'Allows authenticated users to insert a review only when they are one side of the related completed job or listing inquiry and review the opposite side.';
