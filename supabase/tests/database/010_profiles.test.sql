-- RLS: profiles — anon directory read, own-row access, owner-only UPDATE.
BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
CREATE EXTENSION IF NOT EXISTS "supabase_test_helpers";

SELECT plan(12);

SELECT tests.create_supabase_user('prof_owner', 'owner@test.com');
SELECT tests.create_supabase_user('prof_public_fl', 'publicfl@test.com');
SELECT tests.create_supabase_user('prof_private_fl', 'privatefl@test.com');
SELECT tests.create_supabase_user('prof_hirer', 'hirer@test.com');
SELECT tests.create_supabase_user('prof_stranger', 'stranger@test.com');

SELECT tests.authenticate_as_service_role();

UPDATE public.profiles SET full_name = 'Owner', user_type = 'freelancer', phone = '555-0001', email = 'owner@test.com'
WHERE id = tests.get_supabase_uid('prof_owner');

UPDATE public.profiles SET full_name = 'Public FL', user_type = 'freelancer', phone = '555-0002', email = 'publicfl@test.com'
WHERE id = tests.get_supabase_uid('prof_public_fl');

UPDATE public.profiles SET full_name = 'Private FL', user_type = 'freelancer', phone = '555-0003', email = 'privatefl@test.com'
WHERE id = tests.get_supabase_uid('prof_private_fl');

UPDATE public.profiles SET full_name = 'Hirer', user_type = 'hirer', phone = '555-0004', email = 'hirer@test.com'
WHERE id = tests.get_supabase_uid('prof_hirer');

INSERT INTO public.freelancer_profiles (user_id, slug, is_public)
VALUES
  (tests.get_supabase_uid('prof_public_fl'), 'public-fl', true),
  (tests.get_supabase_uid('prof_private_fl'), 'private-fl', false);

INSERT INTO public.hirer_profiles (user_id, company_name)
VALUES (tests.get_supabase_uid('prof_hirer'), 'Acme');

-- anon: can read public freelancer + hirer directory rows, not private-only freelancer
SELECT tests.clear_authentication();

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.profiles WHERE id IN (
       SELECT tests.get_supabase_uid('prof_public_fl')
     ) $$,
  ARRAY[1],
  'anon SELECT: public freelancer profile visible'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.profiles WHERE id = tests.get_supabase_uid('prof_private_fl') $$,
  ARRAY[0],
  'anon SELECT: private-only freelancer profile hidden'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.profiles WHERE id = tests.get_supabase_uid('prof_hirer') $$,
  ARRAY[1],
  'anon SELECT: hirer profile visible in directory'
);

SELECT throws_ok(
  $$ UPDATE public.profiles SET full_name = 'hacked' WHERE id = tests.get_supabase_uid('prof_owner') $$,
  '42501',
  'anon UPDATE: denied'
);

SELECT throws_ok(
  $$ INSERT INTO public.profiles (id, email, full_name, user_type)
     VALUES (gen_random_uuid(), 'x@test.com', 'X', 'freelancer') $$,
  '42501',
  'anon INSERT: denied'
);

-- authenticated stranger: cannot read private profile, cannot update owner
SELECT tests.authenticate_as('prof_stranger');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.profiles WHERE id = tests.get_supabase_uid('prof_private_fl') $$,
  ARRAY[0],
  'authenticated non-participant SELECT: private freelancer hidden'
);

SELECT results_eq(
  $$ WITH u AS (
       UPDATE public.profiles SET full_name = 'hacked'
       WHERE id = tests.get_supabase_uid('prof_owner')
       RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'authenticated non-participant UPDATE: no rows affected'
);

-- owner: read/update own row
SELECT tests.authenticate_as('prof_owner');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.profiles WHERE id = auth.uid() $$,
  ARRAY[1],
  'owner SELECT: own profile visible'
);

SELECT lives_ok(
  $$ UPDATE public.profiles SET city = 'Tbilisi' WHERE id = auth.uid() $$,
  'owner UPDATE: allowed'
);

SELECT results_eq(
  $$ SELECT city FROM public.profiles WHERE id = auth.uid() $$,
  ARRAY['Tbilisi'::text],
  'owner UPDATE: change persisted'
);

SELECT throws_ok(
  $$ DELETE FROM public.profiles WHERE id = auth.uid() $$,
  '42501',
  'owner DELETE: denied (no policy)'
);

SELECT * FROM finish();
ROLLBACK;
