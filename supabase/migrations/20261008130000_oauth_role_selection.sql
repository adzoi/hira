-- Google / Facebook sign-in: OAuth signups carry no user_type, so the profile is created
-- with role_confirmed = false and the user picks freelancer/hirer once via set_initial_role().

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_confirmed boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.role_confirmed IS
  'False until an OAuth signup has chosen freelancer or hirer (email signups choose on the register form).';

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
  RETURN NEW;
END;
$function$;

-- One-time role choice for OAuth signups. user_type is not client-updatable, so this is
-- the only path, and it refuses once the role has been confirmed.
-- OAuth signups can't carry the ?ref= code in signup metadata, so it is passed here too.
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

-- Lets the app route OAuth users who haven't picked a role yet to /auth/callback.
CREATE OR REPLACE FUNCTION public.my_role_confirmed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT role_confirmed FROM profiles WHERE id = auth.uid()), true);
$function$;

REVOKE ALL ON FUNCTION public.my_role_confirmed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_role_confirmed() TO authenticated;
