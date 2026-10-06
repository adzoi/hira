-- Referral links and Hira coins.
-- Every user gets a referral code (hira.ge/register?ref=CODE). The code travels in the signup
-- metadata; once the referred user has a confirmed email and a completed profile
-- (freelancer onboarding done, or hirer company name set), the referrer earns 5 coins.
-- 10 coins buy 7 days of VIP placement for one of the user's jobs or service listings.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hira_coins integer NOT NULL DEFAULT 0;

-- Not covered by the profiles column grants, so users can't edit these themselves.
COMMENT ON COLUMN public.profiles.referral_code IS 'Public code used in referral links; generated on insert.';
COMMENT ON COLUMN public.profiles.referred_by IS 'Profile whose referral link this user signed up with.';
COMMENT ON COLUMN public.profiles.hira_coins IS 'Coin balance; changed only by SECURITY DEFINER functions (see coin_transactions).';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_hira_coins_nonnegative;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_hira_coins_nonnegative CHECK (hira_coins >= 0);

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  -- No 0/o/1/l/i so codes are easy to read aloud.
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  code text;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = code);
  END LOOP;
  RETURN code;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_referral_code() FROM PUBLIC, anon, authenticated;

UPDATE public.profiles SET referral_code = public.generate_referral_code() WHERE referral_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key ON public.profiles (referral_code);

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  referred_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz,
  CONSTRAINT referrals_not_self CHECK (referrer_id <> referred_id)
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals (referrer_id, created_at DESC);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.referrals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.referrals TO authenticated;
DROP POLICY IF EXISTS referrals_select_own ON public.referrals;
CREATE POLICY referrals_select_own ON public.referrals FOR SELECT TO authenticated
  USING (referrer_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reason text NOT NULL CHECK (reason IN ('referral', 'vip_job', 'vip_service')),
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coin_transactions_user_idx ON public.coin_transactions (user_id, created_at DESC);

ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.coin_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.coin_transactions TO authenticated;
DROP POLICY IF EXISTS coin_transactions_select_own ON public.coin_transactions;
CREATE POLICY coin_transactions_select_own ON public.coin_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- New profiles: generate a code and link the referrer from the signup metadata.
CREATE OR REPLACE FUNCTION public.profiles_assign_referral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_referrer uuid;
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;
  NEW.hira_coins := 0;
  NEW.referred_by := NULL;

  SELECT lower(trim(u.raw_user_meta_data ->> 'referral_code')) INTO v_code FROM auth.users u WHERE u.id = NEW.id;
  IF v_code IS NOT NULL AND v_code <> '' THEN
    SELECT id INTO v_referrer FROM profiles WHERE referral_code = v_code;
    IF v_referrer IS NOT NULL AND v_referrer <> NEW.id THEN
      NEW.referred_by := v_referrer;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.profiles_record_referral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.referred_by IS NOT NULL THEN
    INSERT INTO referrals (referrer_id, referred_id) VALUES (NEW.referred_by, NEW.id)
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_assign_referral() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_record_referral() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_assign_referral ON public.profiles;
CREATE TRIGGER profiles_assign_referral
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_assign_referral();

DROP TRIGGER IF EXISTS profiles_record_referral ON public.profiles;
CREATE TRIGGER profiles_record_referral
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_record_referral();

-- Pays the referrer once the referred user qualifies. Safe to call repeatedly.
CREATE OR REPLACE FUNCTION public.reward_referral_if_eligible(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral referrals%ROWTYPE;
  v_reward constant integer := 5;
BEGIN
  SELECT * INTO v_referral FROM referrals
  WHERE referred_id = p_user_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id AND email_confirmed_at IS NOT NULL) THEN
    RETURN;
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM freelancer_profiles WHERE user_id = p_user_id AND is_profile_complete = true)
    OR EXISTS (SELECT 1 FROM hirer_profiles WHERE user_id = p_user_id AND nullif(trim(company_name), '') IS NOT NULL)
  ) THEN
    RETURN;
  END IF;

  UPDATE referrals SET status = 'rewarded', rewarded_at = now() WHERE id = v_referral.id;
  UPDATE profiles SET hira_coins = hira_coins + v_reward WHERE id = v_referral.referrer_id;
  INSERT INTO coin_transactions (user_id, amount, reason, ref_id)
  VALUES (v_referral.referrer_id, v_reward, 'referral', v_referral.id);

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (
    v_referral.referrer_id,
    'referral_reward',
    '+5 ჰირა ქოინი',
    'შენი მოწვეული მომხმარებელი შემოგვიერთდა. 10 ქოინით შეგიძლია განცხადება VIP გახადო.',
    '/dashboard'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reward_referral_if_eligible(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.referral_reward_on_profile_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reward_referral_if_eligible(NEW.user_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.referral_reward_on_profile_complete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS referral_reward_freelancer ON public.freelancer_profiles;
CREATE TRIGGER referral_reward_freelancer
  AFTER INSERT OR UPDATE OF is_profile_complete ON public.freelancer_profiles
  FOR EACH ROW WHEN (NEW.is_profile_complete = true)
  EXECUTE FUNCTION public.referral_reward_on_profile_complete();

DROP TRIGGER IF EXISTS referral_reward_hirer ON public.hirer_profiles;
CREATE TRIGGER referral_reward_hirer
  AFTER INSERT OR UPDATE OF company_name ON public.hirer_profiles
  FOR EACH ROW WHEN (nullif(trim(NEW.company_name), '') IS NOT NULL)
  EXECUTE FUNCTION public.referral_reward_on_profile_complete();

-- Covers users who finish their profile before confirming their email.
CREATE OR REPLACE FUNCTION public.referral_reward_on_email_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reward_referral_if_eligible(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.referral_reward_on_email_confirmed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS referral_reward_email_confirmed ON auth.users;
CREATE TRIGGER referral_reward_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.referral_reward_on_email_confirmed();

-- Spend 10 coins: 7 days of VIP on the caller's own job or service listing.
-- Extends from the current expiry when the post is already VIP.
CREATE OR REPLACE FUNCTION public.spend_coins_for_vip(p_kind text, p_id uuid)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cost constant integer := 10;
  v_days constant integer := 7;
  v_balance integer;
  v_current timestamptz;
  v_expires timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('job', 'service') THEN
    RAISE EXCEPTION 'invalid_kind' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'job' THEN
    SELECT CASE WHEN j.is_vip THEN j.vip_expires_at END INTO v_current
    FROM jobs j JOIN hirer_profiles hp ON hp.id = j.hirer_profile_id
    WHERE j.id = p_id AND hp.user_id = v_uid AND j.status = 'open'
    FOR UPDATE OF j;
  ELSE
    SELECT CASE WHEN s.is_vip THEN s.vip_expires_at END INTO v_current
    FROM services s JOIN freelancer_profiles fp ON fp.id = s.freelancer_profile_id
    WHERE s.id = p_id AND fp.user_id = v_uid AND s.is_active = true
    FOR UPDATE OF s;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT hira_coins INTO v_balance FROM profiles WHERE id = v_uid FOR UPDATE;
  IF coalesce(v_balance, 0) < v_cost THEN
    RAISE EXCEPTION 'insufficient_coins' USING ERRCODE = 'P0001';
  END IF;

  v_expires := greatest(coalesce(v_current, now()), now()) + make_interval(days => v_days);

  IF p_kind = 'job' THEN
    UPDATE jobs SET is_vip = true, vip_tier = coalesce(vip_tier, 'bronze'), vip_expires_at = v_expires WHERE id = p_id;
  ELSE
    UPDATE services SET is_vip = true, vip_expires_at = v_expires WHERE id = p_id;
  END IF;

  UPDATE profiles SET hira_coins = hira_coins - v_cost WHERE id = v_uid;
  INSERT INTO coin_transactions (user_id, amount, reason, ref_id)
  VALUES (v_uid, -v_cost, CASE WHEN p_kind = 'job' THEN 'vip_job' ELSE 'vip_service' END, p_id);

  RETURN json_build_object('vip_expires_at', v_expires, 'balance', v_balance - v_cost);
END;
$$;

REVOKE ALL ON FUNCTION public.spend_coins_for_vip(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_coins_for_vip(text, uuid) TO authenticated;

-- Dashboard card data for the signed-in user.
CREATE OR REPLACE FUNCTION public.get_my_referral_summary()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'referral_code', p.referral_code,
    'coins', p.hira_coins,
    'pending', (SELECT count(*) FROM referrals r WHERE r.referrer_id = p.id AND r.status = 'pending'),
    'rewarded', (SELECT count(*) FROM referrals r WHERE r.referrer_id = p.id AND r.status = 'rewarded')
  )
  FROM profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_referral_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_referral_summary() TO authenticated;
