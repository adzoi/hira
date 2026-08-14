-- RLS: reviews, notifications, completed_jobs (reputation + private alerts)
BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
CREATE EXTENSION IF NOT EXISTS "supabase_test_helpers";

SELECT plan(15);

SELECT tests.create_supabase_user('rev_hirer');
SELECT tests.create_supabase_user('rev_freelancer');
SELECT tests.create_supabase_user('rev_stranger');

SELECT tests.authenticate_as_service_role();

INSERT INTO public.hirer_profiles (user_id) VALUES (tests.get_supabase_uid('rev_hirer'));
INSERT INTO public.freelancer_profiles (user_id, slug, is_public)
VALUES (tests.get_supabase_uid('rev_freelancer'), 'rev-fl', true);

INSERT INTO public.jobs (hirer_profile_id, title, description, budget_type, duration_type, location_type, contact_preference, status)
SELECT hp.id, 'Done Job', 'Finished', 'fixed', 'one_time', 'remote', 'platform', 'completed'
FROM public.hirer_profiles hp WHERE hp.user_id = tests.get_supabase_uid('rev_hirer');

INSERT INTO public.job_applications (job_id, freelancer_profile_id, cover_note, status)
SELECT j.id, fp.id, 'I can do this', 'completed'
FROM public.jobs j
JOIN public.freelancer_profiles fp ON fp.user_id = tests.get_supabase_uid('rev_freelancer')
WHERE j.title = 'Done Job';

INSERT INTO public.conversations (participant_low, participant_high, job_application_id)
SELECT
  LEAST(tests.get_supabase_uid('rev_hirer'), tests.get_supabase_uid('rev_freelancer')),
  GREATEST(tests.get_supabase_uid('rev_hirer'), tests.get_supabase_uid('rev_freelancer')),
  ja.id
FROM public.job_applications ja
JOIN public.jobs j ON j.id = ja.job_id
WHERE j.title = 'Done Job';

INSERT INTO public.completed_jobs (job_id, hirer_profile_id, freelancer_profile_id, completed_at, hirer_confirmed, freelancer_confirmed)
SELECT j.id, j.hirer_profile_id, fp.id, now(), true, true
FROM public.jobs j
JOIN public.freelancer_profiles fp ON fp.user_id = tests.get_supabase_uid('rev_freelancer')
WHERE j.title = 'Done Job';

INSERT INTO public.messages (conversation_id, sender_id, body, created_at)
SELECT c.id, tests.get_supabase_uid('rev_hirer'), 'Brief sent', now() - interval '3 hours'
FROM public.conversations c
JOIN public.job_applications ja ON ja.id = c.job_application_id
JOIN public.jobs j ON j.id = ja.job_id
WHERE j.title = 'Done Job';

INSERT INTO public.messages (conversation_id, sender_id, body, created_at)
SELECT c.id, tests.get_supabase_uid('rev_freelancer'), 'Got it', now() - interval '2 hours'
FROM public.conversations c
JOIN public.job_applications ja ON ja.id = c.job_application_id
JOIN public.jobs j ON j.id = ja.job_id
WHERE j.title = 'Done Job';

INSERT INTO public.messages (conversation_id, sender_id, body, created_at)
SELECT c.id, tests.get_supabase_uid('rev_hirer'), 'Thanks', now() - interval '1 hour'
FROM public.conversations c
JOIN public.job_applications ja ON ja.id = c.job_application_id
JOIN public.jobs j ON j.id = ja.job_id
WHERE j.title = 'Done Job';

INSERT INTO public.reviews (
  reviewer_id, reviewee_id, completed_job_id,
  rating_overall, rating_quality, rating_communication, rating_timeliness, review_text
)
SELECT tests.get_supabase_uid('rev_hirer'), tests.get_supabase_uid('rev_freelancer'), cj.id,
       5, 5, 5, 5, 'Great work'
FROM public.completed_jobs cj LIMIT 1;

INSERT INTO public.notifications (user_id, title, type, body, link)
VALUES
  (tests.get_supabase_uid('rev_hirer'), 'Hirer alert', 'info', 'Body', '/dashboard'),
  (tests.get_supabase_uid('rev_freelancer'), 'FL alert', 'info', 'Body', '/dashboard');

-- anon: public reviews for public profile pages; no notifications
SELECT tests.clear_authentication();

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.reviews WHERE review_text = 'Great work' $$,
  ARRAY[1],
  'anon SELECT reviews: public review on public freelancer visible'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.notifications $$,
  ARRAY[0],
  'anon SELECT notifications: denied'
);

SELECT throws_ok(
  $$ INSERT INTO public.notifications (user_id, title, type)
     VALUES (gen_random_uuid(), 'spam', 'info') $$,
  '42501',
  'anon INSERT notifications: denied'
);

-- stranger: cannot read private notifications, cannot insert review without participation
SELECT tests.authenticate_as('rev_stranger');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.notifications $$,
  ARRAY[0],
  'stranger SELECT notifications: hidden'
);

SELECT throws_ok(
  $$ INSERT INTO public.reviews (
       reviewer_id, reviewee_id, completed_job_id,
       rating_overall, rating_quality, rating_communication, rating_timeliness, review_text
     )
     SELECT auth.uid(), tests.get_supabase_uid('rev_freelancer'), cj.id, 1, 1, 1, 1, 'fake'
     FROM public.completed_jobs cj LIMIT 1 $$,
  '42501',
  'stranger INSERT reviews: denied (not a participant)'
);

SELECT results_eq(
  $$ WITH u AS (
       UPDATE public.reviews SET review_text = 'tampered' RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'stranger UPDATE reviews: denied'
);

-- notification owner
SELECT tests.authenticate_as('rev_hirer');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE user_id = auth.uid() $$,
  ARRAY[1],
  'owner SELECT notifications: own row visible'
);

SELECT lives_ok(
  $$ UPDATE public.notifications SET is_read = true WHERE user_id = auth.uid() $$,
  'owner UPDATE notifications: allowed'
);

SELECT lives_ok(
  $$ DELETE FROM public.notifications WHERE user_id = auth.uid() $$,
  'owner DELETE notifications: allowed'
);

SELECT throws_ok(
  $$ INSERT INTO public.notifications (user_id, title, type)
     VALUES (auth.uid(), 'direct insert', 'info') $$,
  '42501',
  'authenticated INSERT notifications: revoked at GRANT level'
);

-- review author cannot update own review (immutable after insert)
SELECT tests.authenticate_as('rev_hirer');

SELECT results_eq(
  $$ WITH u AS (
       UPDATE public.reviews SET review_text = 'Updated praise' WHERE reviewer_id = auth.uid() RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'reviewer UPDATE own reviews: denied (immutable)'
);

-- completed_jobs participants
SELECT tests.authenticate_as('rev_freelancer');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.completed_jobs $$,
  ARRAY[1],
  'freelancer participant SELECT completed_jobs: visible'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.notifications WHERE user_id = auth.uid() $$,
  ARRAY[1],
  'freelancer owner SELECT notifications: own row visible'
);

SELECT results_eq(
  $$ WITH u AS (
       UPDATE public.completed_jobs SET freelancer_confirmed = false RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[1],
  'freelancer participant UPDATE completed_jobs: allowed'
);

SELECT tests.authenticate_as('rev_stranger');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.completed_jobs $$,
  ARRAY[1],
  'stranger SELECT completed_jobs: visible via public portfolio policy when freelancer is public'
);

SELECT * FROM finish();
ROLLBACK;
