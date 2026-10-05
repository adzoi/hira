-- RLS: job_applications and service_inquiries (money-adjacent private workflow data)
BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
CREATE EXTENSION IF NOT EXISTS "supabase_test_helpers";

SELECT plan(24);

SELECT tests.create_supabase_user('inq_hirer');
SELECT tests.create_supabase_user('inq_freelancer');
SELECT tests.create_supabase_user('inq_stranger');
SELECT tests.create_supabase_user('app_hirer');
SELECT tests.create_supabase_user('app_freelancer');

SELECT tests.authenticate_as_service_role();

INSERT INTO public.hirer_profiles (user_id) VALUES (tests.get_supabase_uid('inq_hirer'));
INSERT INTO public.hirer_profiles (user_id) VALUES (tests.get_supabase_uid('app_hirer'));
INSERT INTO public.freelancer_profiles (user_id, slug, is_public)
VALUES
  (tests.get_supabase_uid('inq_freelancer'), 'inq-fl', true),
  (tests.get_supabase_uid('app_freelancer'), 'app-fl', true);

INSERT INTO public.jobs (hirer_profile_id, title, description, budget_type, duration_type, location_type, contact_preference, status)
SELECT hp.id, 'App Job', 'Need help', 'fixed', 'one_time', 'remote', 'platform', 'open'
FROM public.hirer_profiles hp WHERE hp.user_id = tests.get_supabase_uid('app_hirer');

INSERT INTO public.services (freelancer_profile_id, title, price, is_active)
SELECT fp.id, 'Listing', 200, true
FROM public.freelancer_profiles fp WHERE fp.user_id = tests.get_supabase_uid('inq_freelancer');

INSERT INTO public.services (freelancer_profile_id, title, price, is_active)
SELECT fp.id, 'Listing Alt', 150, true
FROM public.freelancer_profiles fp WHERE fp.user_id = tests.get_supabase_uid('inq_freelancer');

INSERT INTO public.job_applications (job_id, freelancer_profile_id, cover_note, status)
SELECT j.id, fp.id, 'Hire me', 'pending'
FROM public.jobs j
JOIN public.freelancer_profiles fp ON fp.user_id = tests.get_supabase_uid('app_freelancer')
WHERE j.title = 'App Job';

INSERT INTO public.service_inquiries (service_id, hirer_profile_id, freelancer_profile_id, message, status)
SELECT s.id, hp.id, fp.id, 'Interested in your listing', 'pending'
FROM public.services s
JOIN public.hirer_profiles hp ON hp.user_id = tests.get_supabase_uid('inq_hirer')
JOIN public.freelancer_profiles fp ON fp.id = s.freelancer_profile_id
WHERE s.title = 'Listing';

-- anon: no read/write on private workflow rows
SELECT tests.clear_authentication();

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.job_applications $$,
  ARRAY[0],
  'anon SELECT job_applications: denied'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.service_inquiries $$,
  ARRAY[0],
  'anon SELECT service_inquiries: denied'
);

SELECT throws_ok(
  $$ INSERT INTO public.job_applications (job_id, freelancer_profile_id)
     SELECT j.id, fp.id FROM public.jobs j, public.freelancer_profiles fp LIMIT 1 $$,
  '42501',
  'anon INSERT job_applications: denied'
);

-- stranger authenticated: cannot see or mutate others' rows
SELECT tests.authenticate_as('inq_stranger');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.service_inquiries $$,
  ARRAY[0],
  'stranger SELECT service_inquiries: hidden'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.job_applications $$,
  ARRAY[0],
  'stranger SELECT job_applications: hidden'
);

SELECT results_eq(
  $$ WITH u AS (
       UPDATE public.service_inquiries SET message = 'leak'
       RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'stranger UPDATE service_inquiries: denied'
);

-- hirer participant on inquiry
SELECT tests.authenticate_as('inq_hirer');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.service_inquiries WHERE message = 'Interested in your listing' $$,
  ARRAY[1],
  'hirer owner SELECT service_inquiries: own inquiry visible'
);

SELECT lives_ok(
  $$ UPDATE public.service_inquiries SET proposed_budget = 180
     WHERE hirer_profile_id IN (SELECT id FROM public.hirer_profiles WHERE user_id = auth.uid()) $$,
  'hirer owner UPDATE service_inquiries: allowed'
);

SELECT results_eq(
  $$ WITH u AS (
       UPDATE public.service_inquiries
       SET freelancer_profile_id = (
         SELECT fp.id FROM public.freelancer_profiles fp
         WHERE fp.user_id = tests.get_supabase_uid('app_freelancer')
         LIMIT 1
       )
       WHERE hirer_profile_id IN (SELECT id FROM public.hirer_profiles WHERE user_id = auth.uid())
       RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'hirer owner UPDATE service_inquiries: cannot reassign freelancer_profile_id'
);

SELECT lives_ok(
  $$ INSERT INTO public.service_inquiries (service_id, hirer_profile_id, freelancer_profile_id, message)
     SELECT s.id, hp.id, s.freelancer_profile_id, 'Another inquiry'
     FROM public.services s
     JOIN public.hirer_profiles hp ON hp.user_id = auth.uid()
     WHERE s.title = 'Listing' $$,
  'hirer owner INSERT service_inquiries: allowed'
);

-- freelancer participant on inquiry
SELECT tests.authenticate_as('inq_freelancer');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.service_inquiries $$,
  ARRAY[2],
  'freelancer owner SELECT service_inquiries: inquiries on own listing visible'
);

SELECT lives_ok(
  $$ UPDATE public.service_inquiries SET status = 'accepted'
     WHERE id = (
       SELECT si.id FROM public.service_inquiries si
       JOIN public.freelancer_profiles fp ON fp.id = si.freelancer_profile_id
       WHERE fp.user_id = auth.uid() AND si.status = 'pending'
       LIMIT 1
     ) $$,
  'freelancer owner UPDATE service_inquiries: allowed'
);

SELECT results_eq(
  $$ WITH u AS (
       UPDATE public.service_inquiries
       SET hirer_profile_id = (
         SELECT hp.id FROM public.hirer_profiles hp
         WHERE hp.user_id = tests.get_supabase_uid('app_hirer')
         LIMIT 1
       )
       WHERE freelancer_profile_id IN (
         SELECT id FROM public.freelancer_profiles WHERE user_id = auth.uid()
       )
       RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'freelancer owner UPDATE service_inquiries: cannot reassign hirer_profile_id'
);

SELECT results_eq(
  $$ WITH u AS (
       UPDATE public.service_inquiries
       SET service_id = (
         SELECT s.id FROM public.services s
         WHERE s.title = 'Listing Alt'
         LIMIT 1
       )
       WHERE freelancer_profile_id IN (
         SELECT id FROM public.freelancer_profiles WHERE user_id = auth.uid()
       )
       RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'freelancer owner UPDATE service_inquiries: cannot reassign service_id'
);

-- job application: freelancer applicant
SELECT tests.authenticate_as('app_freelancer');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.job_applications $$,
  ARRAY[1],
  'applicant SELECT job_applications: own application visible'
);

SELECT results_eq(
  $$ WITH u AS (
       UPDATE public.job_applications SET status = 'accepted'
       WHERE freelancer_profile_id IN (SELECT id FROM public.freelancer_profiles WHERE user_id = auth.uid())
       RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'applicant UPDATE job_applications (self-accept): no rows affected'
);

-- job hirer sees applications on own job
SELECT tests.authenticate_as('app_hirer');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.job_applications $$,
  ARRAY[1],
  'hirer SELECT job_applications: applications on own job visible'
);

SELECT lives_ok(
  $$ UPDATE public.job_applications SET status = 'accepted'
     WHERE job_id IN (
       SELECT j.id FROM public.jobs j
       JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
       WHERE hp.user_id = auth.uid()
     ) $$,
  'hirer UPDATE job_applications on own job: allowed'
);

SELECT throws_ok(
  $$ UPDATE public.job_applications SET cover_note = 'Rewritten by hirer' $$,
  '42501',
  'hirer UPDATE job_applications non-status column: denied (column grant)'
);

SELECT throws_ok(
  $$ INSERT INTO public.job_applications (job_id, freelancer_profile_id)
     SELECT j.id, fp.id
     FROM public.jobs j
     JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
     JOIN public.freelancer_profiles fp ON fp.user_id = tests.get_supabase_uid('app_freelancer')
     WHERE hp.user_id = auth.uid() $$,
  '42501',
  'hirer INSERT job_applications: denied (only freelancers apply)'
);

SELECT results_eq(
  $$ WITH u AS (DELETE FROM public.job_applications RETURNING 1) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'hirer DELETE job_applications: denied (no policy)'
);

SELECT * FROM finish();
ROLLBACK;
