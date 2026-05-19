-- Copy phone and city from signup metadata into profiles (registration form sends both).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, user_type, city, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'freelancer'),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'city', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '')
  );
  RETURN NEW;
END;
$function$;

-- Backfill existing accounts where metadata was saved but profiles row was not updated.
UPDATE public.profiles p
SET
  phone = COALESCE(
    NULLIF(TRIM(p.phone), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'phone'), '')
  ),
  city = COALESCE(
    NULLIF(TRIM(p.city), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'city'), '')
  )
FROM auth.users u
WHERE p.id = u.id
  AND (
    (p.phone IS NULL OR TRIM(p.phone) = '')
      AND NULLIF(TRIM(u.raw_user_meta_data->>'phone'), '') IS NOT NULL
    OR (p.city IS NULL OR TRIM(p.city) = '')
      AND NULLIF(TRIM(u.raw_user_meta_data->>'city'), '') IS NOT NULL
  );
