-- RLS: jobs and services (marketplace listings)
BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
CREATE EXTENSION IF NOT EXISTS "supabase_test_helpers";

SELECT plan(12);

SELECT tests.create_supabase_user('job_hirer');
SELECT tests.create_supabase_user('job_stranger');
SELECT tests.create_supabase_user('svc_freelancer');

SELECT tests.authenticate_as_service_role();

INSERT INTO public.hirer_profiles (user_id, company_name)
VALUES (tests.get_supabase_uid('job_hirer'), 'Jobs Inc');

INSERT INTO public.freelancer_profiles (user_id, slug, is_public)
VALUES (tests.get_supabase_uid('svc_freelancer'), 'svc-fl', true);

INSERT INTO public.jobs (hirer_profile_id, title, description, budget_type, duration_type, location_type, contact_preference, status)
SELECT hp.id, 'Open Job', 'Desc', 'fixed', 'one_time', 'remote', 'platform', 'open'
FROM public.hirer_profiles hp WHERE hp.user_id = tests.get_supabase_uid('job_hirer');

INSERT INTO public.services (freelancer_profile_id, title, price, is_active)
SELECT fp.id, 'Logo Design', 100, true
FROM public.freelancer_profiles fp WHERE fp.user_id = tests.get_supabase_uid('svc_freelancer');

-- anon: read open public listings
SELECT tests.clear_authentication();

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.jobs WHERE title = 'Open Job' $$,
  ARRAY[1],
  'anon SELECT jobs: open job visible'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.services WHERE title = 'Logo Design' $$,
  ARRAY[1],
  'anon SELECT services: active public listing visible'
);

SELECT throws_ok(
  $$ INSERT INTO public.jobs (hirer_profile_id, title, description, budget_type, duration_type, location_type, contact_preference)
     SELECT id, 'Bad', 'Bad', 'fixed', 'one_time', 'remote', 'platform' FROM public.hirer_profiles LIMIT 1 $$,
  '42501',
  'anon INSERT jobs: denied'
);

SELECT throws_ok(
  $$ INSERT INTO public.services (freelancer_profile_id, title, price)
     SELECT id, 'Bad', 1 FROM public.freelancer_profiles LIMIT 1 $$,
  '42501',
  'anon INSERT services: denied'
);

-- stranger authenticated: read but not mutate
SELECT tests.authenticate_as('job_stranger');

SELECT results_eq(
  $$ WITH u AS (
       UPDATE public.jobs SET title = 'Hacked' WHERE title = 'Open Job' RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'authenticated non-owner UPDATE jobs: denied'
);

SELECT results_eq(
  $$ WITH u AS (
       DELETE FROM public.services WHERE title = 'Logo Design' RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'authenticated non-owner DELETE services: denied'
);

-- hirer owner
SELECT tests.authenticate_as('job_hirer');

SELECT lives_ok(
  $$ UPDATE public.jobs SET title = 'Updated Job'
     WHERE hirer_profile_id IN (SELECT id FROM public.hirer_profiles WHERE user_id = auth.uid()) $$,
  'hirer owner UPDATE jobs: allowed'
);

SELECT lives_ok(
  $$ INSERT INTO public.jobs (hirer_profile_id, title, description, budget_type, duration_type, location_type, contact_preference)
     SELECT id, 'Second Job', 'Desc2', 'fixed', 'one_time', 'remote', 'platform'
     FROM public.hirer_profiles WHERE user_id = auth.uid() $$,
  'hirer owner INSERT jobs: allowed'
);

SELECT lives_ok(
  $$ DELETE FROM public.jobs WHERE title = 'Second Job' $$,
  'hirer owner DELETE jobs: allowed'
);

-- freelancer service owner
SELECT tests.authenticate_as('svc_freelancer');

SELECT lives_ok(
  $$ UPDATE public.services SET price = 150
     WHERE freelancer_profile_id IN (SELECT id FROM public.freelancer_profiles WHERE user_id = auth.uid()) $$,
  'freelancer owner UPDATE services: allowed'
);

SELECT lives_ok(
  $$ INSERT INTO public.services (freelancer_profile_id, title, price)
     SELECT id, 'Extra Service', 50 FROM public.freelancer_profiles WHERE user_id = auth.uid() $$,
  'freelancer owner INSERT services: allowed'
);

SELECT lives_ok(
  $$ DELETE FROM public.services WHERE title = 'Extra Service' $$,
  'freelancer owner DELETE services: allowed'
);

SELECT * FROM finish();
ROLLBACK;
