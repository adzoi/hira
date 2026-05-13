-- Freelancer VIP targets `services.id`; hirer VIP uses `jobs.id`. The original FK only allowed jobs.
ALTER TABLE public.vip_payments DROP CONSTRAINT IF EXISTS vip_payments_listing_id_fkey;

COMMENT ON COLUMN public.vip_payments.listing_id IS
  'PayPal VIP target id: public.jobs.id for job postings, or public.services.id for freelancer listings (see activate-vip listing_type).';
