-- Enforce maximum lengths on user-generated text at the database layer.

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_body_max_length,
  ADD CONSTRAINT messages_body_max_length CHECK (char_length(body) <= 4000);

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_title_max_length,
  ADD CONSTRAINT jobs_title_max_length CHECK (char_length(title) <= 100),
  DROP CONSTRAINT IF EXISTS jobs_description_max_length,
  ADD CONSTRAINT jobs_description_max_length CHECK (char_length(description) <= 20000);

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_title_max_length,
  ADD CONSTRAINT services_title_max_length CHECK (char_length(title) <= 120),
  DROP CONSTRAINT IF EXISTS services_description_max_length,
  ADD CONSTRAINT services_description_max_length CHECK (char_length(description) <= 20000);

ALTER TABLE public.service_inquiries
  DROP CONSTRAINT IF EXISTS service_inquiries_message_max_length,
  ADD CONSTRAINT service_inquiries_message_max_length CHECK (char_length(message) <= 5000);

ALTER TABLE public.job_applications
  DROP CONSTRAINT IF EXISTS job_applications_cover_note_max_length,
  ADD CONSTRAINT job_applications_cover_note_max_length CHECK (
    cover_note IS NULL OR char_length(cover_note) <= 5500
  );

ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_review_text_max_length,
  ADD CONSTRAINT reviews_review_text_max_length CHECK (char_length(review_text) <= 2000);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_full_name_max_length,
  ADD CONSTRAINT profiles_full_name_max_length CHECK (char_length(full_name) <= 120),
  DROP CONSTRAINT IF EXISTS profiles_city_max_length,
  ADD CONSTRAINT profiles_city_max_length CHECK (city IS NULL OR char_length(city) <= 100),
  DROP CONSTRAINT IF EXISTS profiles_phone_max_length,
  ADD CONSTRAINT profiles_phone_max_length CHECK (phone IS NULL OR char_length(phone) <= 32);

ALTER TABLE public.freelancer_profiles
  DROP CONSTRAINT IF EXISTS freelancer_profiles_bio_max_length,
  ADD CONSTRAINT freelancer_profiles_bio_max_length CHECK (bio IS NULL OR char_length(bio) <= 5000),
  DROP CONSTRAINT IF EXISTS freelancer_profiles_professional_title_max_length,
  ADD CONSTRAINT freelancer_profiles_professional_title_max_length CHECK (
    professional_title IS NULL OR char_length(professional_title) <= 120
  );

ALTER TABLE public.hirer_profiles
  DROP CONSTRAINT IF EXISTS hirer_profiles_description_max_length,
  ADD CONSTRAINT hirer_profiles_description_max_length CHECK (
    description IS NULL OR char_length(description) <= 5000
  ),
  DROP CONSTRAINT IF EXISTS hirer_profiles_company_name_max_length,
  ADD CONSTRAINT hirer_profiles_company_name_max_length CHECK (
    company_name IS NULL OR char_length(company_name) <= 120
  );

COMMENT ON CONSTRAINT messages_body_max_length ON public.messages IS 'Reject oversized chat payloads.';
COMMENT ON CONSTRAINT jobs_description_max_length ON public.jobs IS 'Reject oversized job descriptions.';
