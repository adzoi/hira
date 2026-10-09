-- Freelancers only got a freelancer_profiles row at the end of onboarding, so everyone who
-- stopped part-way (about half of signups) had no public profile at all. Create the row at
-- signup instead: public, but is_profile_complete = false so the UI can mark it "in progress"
-- and list it after complete profiles. Onboarding fills the same row in (upsert on user_id)
-- and flips is_profile_complete, which still fires the referral reward.

CREATE OR REPLACE FUNCTION public.ensure_freelancer_profile(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  INSERT INTO public.freelancer_profiles (user_id, slug, is_public, is_profile_complete)
  VALUES (
    p_user_id,
    'freelancer-' || left(p_user_id::text, 8) || '-' || substr(md5(random()::text), 1, 4),
    true,
    false
  )
  ON CONFLICT (user_id) DO NOTHING;
$function$;

REVOKE ALL ON FUNCTION public.ensure_freelancer_profile(uuid) FROM PUBLIC, anon, authenticated;

-- Email signups choose their role on the register form, so freelancers get the row right away.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_type text := NULLIF(NEW.raw_user_meta_data->>'user_type', '');
BEGIN
  INSERT INTO public.profiles (id, email, full_name, user_type, city, phone, role_confirmed)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(v_user_type, 'freelancer'),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'city', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), ''),
    v_user_type IS NOT NULL
  );

  IF v_user_type = 'freelancer' THEN
    PERFORM public.ensure_freelancer_profile(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

-- OAuth signups pick their role afterwards; create the row once they choose freelancer.
CREATE OR REPLACE FUNCTION public.set_initial_role(
  p_user_type text,
  p_city text,
  p_phone text DEFAULT NULL,
  p_referral_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_referrer uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF p_user_type NOT IN ('freelancer', 'hirer') THEN
    RAISE EXCEPTION 'INVALID_USER_TYPE';
  END IF;
  IF length(COALESCE(p_city, '')) > 100 OR length(COALESCE(p_phone, '')) > 32 THEN
    RAISE EXCEPTION 'FIELD_TOO_LONG';
  END IF;

  UPDATE public.profiles
     SET user_type = p_user_type,
         city = NULLIF(TRIM(COALESCE(p_city, '')), ''),
         phone = COALESCE(NULLIF(TRIM(COALESCE(p_phone, '')), ''), phone),
         role_confirmed = true
   WHERE id = auth.uid()
     AND role_confirmed = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROLE_ALREADY_SET';
  END IF;

  IF p_user_type = 'freelancer' THEN
    PERFORM public.ensure_freelancer_profile(auth.uid());
  END IF;

  IF NULLIF(TRIM(COALESCE(p_referral_code, '')), '') IS NOT NULL THEN
    SELECT id INTO v_referrer FROM profiles WHERE referral_code = lower(trim(p_referral_code));
    IF v_referrer IS NOT NULL AND v_referrer <> auth.uid() THEN
      UPDATE profiles SET referred_by = v_referrer WHERE id = auth.uid() AND referred_by IS NULL;
      IF FOUND THEN
        INSERT INTO referrals (referrer_id, referred_id) VALUES (v_referrer, auth.uid())
        ON CONFLICT (referred_id) DO NOTHING;
      END IF;
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_initial_role(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_initial_role(text, text, text, text) TO authenticated;

-- Backfill freelancers who signed up but never finished onboarding.
SELECT public.ensure_freelancer_profile(p.id)
FROM public.profiles p
WHERE p.user_type = 'freelancer'
  AND p.role_confirmed
  AND p.is_active IS NOT FALSE
  AND NOT EXISTS (SELECT 1 FROM public.freelancer_profiles fp WHERE fp.user_id = p.id);
