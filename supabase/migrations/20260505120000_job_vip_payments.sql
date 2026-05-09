-- VIP featured jobs (PayPal): columns on jobs + payment audit table.
-- Note: vip_payments.listing_id references public.jobs(id) per product naming.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS is_vip boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vip_tier text,
  ADD COLUMN IF NOT EXISTS vip_expires_at timestamptz;

COMMENT ON COLUMN public.jobs.is_vip IS 'True when job has an active paid VIP / featured placement.';
COMMENT ON COLUMN public.jobs.vip_tier IS 'bronze | silver | gold';
COMMENT ON COLUMN public.jobs.vip_expires_at IS 'When VIP placement ends; null if not VIP or legacy row.';

CREATE TABLE IF NOT EXISTS public.vip_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  tier text NOT NULL,
  paypal_order_id text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'GEL',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vip_payments_paypal_order_id_key UNIQUE (paypal_order_id)
);

CREATE INDEX IF NOT EXISTS vip_payments_listing_id_idx ON public.vip_payments (listing_id);
CREATE INDEX IF NOT EXISTS vip_payments_user_id_idx ON public.vip_payments (user_id);

COMMENT ON TABLE public.vip_payments IS 'PayPal VIP purchases for featured job postings (listing_id -> jobs.id).';

ALTER TABLE public.vip_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own vip_payments" ON public.vip_payments;
CREATE POLICY "Users read own vip_payments"
  ON public.vip_payments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
