-- RLS: freelancer_profiles and hirer_profiles
BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
CREATE EXTENSION IF NOT EXISTS "supabase_test_helpers";

SELECT plan(11);

SELECT tests.create_supabase_user('fp_owner');
SELECT tests.create_supabase_user('fp_stranger');
SELECT tests.create_supabase_user('hp_owner');

SELECT tests.authenticate_as_service_role();

INSERT INTO public.freelancer_profiles (user_id, slug, is_public, professional_title)
VALUES (tests.get_supabase_uid('fp_owner'), 'fp-owner', true, 'Designer');

INSERT INTO public.hirer_profiles (user_id, company_name)
VALUES (tests.get_supabase_uid('hp_owner'), 'Hira Co');

-- anon: public freelancer visible, cannot write
SELECT tests.clear_authentication();

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.freelancer_profiles WHERE slug = 'fp-owner' $$,
  ARRAY[1],
  'anon SELECT freelancer_profiles: public row visible'
);

SELECT throws_ok(
  $$ INSERT INTO public.freelancer_profiles (user_id, slug)
     VALUES (gen_random_uuid(), 'evil') $$,
  '42501',
  'anon INSERT freelancer_profiles: denied'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.hirer_profiles $$,
  ARRAY[1],
  'anon SELECT hirer_profiles: directory visible'
);

-- stranger authenticated: read only, no update/delete
SELECT tests.authenticate_as('fp_stranger');

SELECT results_eq(
  $$ WITH u AS (
       UPDATE public.freelancer_profiles SET bio = 'hacked' WHERE slug = 'fp-owner' RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'authenticated non-owner UPDATE freelancer_profiles: denied'
);

SELECT results_eq(
  $$ WITH u AS (
       DELETE FROM public.freelancer_profiles WHERE slug = 'fp-owner' RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'authenticated non-owner DELETE freelancer_profiles: denied'
);

-- owner: full CRUD on own extended profile
SELECT tests.authenticate_as('fp_owner');

SELECT lives_ok(
  $$ UPDATE public.freelancer_profiles SET bio = 'My bio' WHERE user_id = auth.uid() $$,
  'owner UPDATE freelancer_profiles: allowed'
);

SELECT tests.authenticate_as('hp_owner');

SELECT lives_ok(
  $$ UPDATE public.hirer_profiles SET company_name = 'Updated Co' WHERE user_id = auth.uid() $$,
  'owner UPDATE hirer_profiles: allowed'
);

SELECT lives_ok(
  $$ DELETE FROM public.hirer_profiles WHERE user_id = auth.uid() $$,
  'owner DELETE hirer_profiles: allowed'
);

SELECT tests.authenticate_as('fp_stranger');

SELECT throws_ok(
  $$ INSERT INTO public.hirer_profiles (user_id, company_name)
     VALUES (tests.get_supabase_uid('fp_owner'), 'stolen') $$,
  '42501',
  'non-owner INSERT hirer_profiles for another user: denied'
);

SELECT results_eq(
  $$ WITH u AS (
       UPDATE public.hirer_profiles SET company_name = 'hack'
       WHERE user_id = tests.get_supabase_uid('hp_owner') RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'non-owner UPDATE hirer_profiles: denied'
);

SELECT results_eq(
  $$ WITH u AS (
       DELETE FROM public.hirer_profiles
       WHERE user_id = tests.get_supabase_uid('hp_owner') RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'non-owner DELETE hirer_profiles: denied'
);

SELECT * FROM finish();
ROLLBACK;
