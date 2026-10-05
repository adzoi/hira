-- RLS: follows, reports, user_saved_items, profile_visits, vip_payments, forum
BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
CREATE EXTENSION IF NOT EXISTS "supabase_test_helpers";

SELECT plan(20);

SELECT tests.create_supabase_user('soc_a');
SELECT tests.create_supabase_user('soc_b');
SELECT tests.create_supabase_user('soc_stranger');

SELECT tests.authenticate_as_service_role();

INSERT INTO public.freelancer_profiles (user_id, slug, is_public)
VALUES (tests.get_supabase_uid('soc_a'), 'soc-a', true);

INSERT INTO public.hirer_profiles (user_id, company_name)
VALUES (tests.get_supabase_uid('soc_b'), 'Soc B');

INSERT INTO public.jobs (hirer_profile_id, title, description, budget_type, duration_type, location_type, contact_preference)
SELECT hp.id, 'VIP Job', 'VIP', 'fixed', 'one_time', 'remote', 'platform'
FROM public.hirer_profiles hp WHERE hp.user_id = tests.get_supabase_uid('soc_b');

INSERT INTO public.vip_payments (listing_id, user_id, tier, paypal_order_id, amount)
SELECT j.id, tests.get_supabase_uid('soc_b'), 'bronze', 'PAY-TEST-1', 10
FROM public.jobs j WHERE j.title = 'VIP Job';

INSERT INTO public.profile_visits (freelancer_profile_id, visitor_user_id)
SELECT fp.id, tests.get_supabase_uid('soc_b')
FROM public.freelancer_profiles fp WHERE fp.slug = 'soc-a';

INSERT INTO public.user_saved_items (user_id, resource_type, resource_id)
SELECT tests.get_supabase_uid('soc_b'), 'freelancer', fp.id
FROM public.freelancer_profiles fp WHERE fp.slug = 'soc-a';

INSERT INTO public.follows (follower_id, following_id)
VALUES (tests.get_supabase_uid('soc_b'), tests.get_supabase_uid('soc_a'));

INSERT INTO public.forum_posts (author_id, author_name, category, subcategory, title, body)
VALUES (tests.get_supabase_uid('soc_a'), 'Soc A', 'general', 'intro', 'Hello forum', 'First post');

-- anon: forum public read; profile visit insert; no saved items / vip payments
SELECT tests.clear_authentication();

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.forum_posts WHERE title = 'Hello forum' $$,
  ARRAY[1],
  'anon SELECT forum_posts: public read'
);

SELECT lives_ok(
  $$ INSERT INTO public.profile_visits (freelancer_profile_id, visitor_user_id)
     SELECT fp.id, NULL FROM public.freelancer_profiles fp WHERE fp.slug = 'soc-a' $$,
  'anon INSERT profile_visits with null visitor_user_id: allowed'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.profile_visits $$,
  ARRAY[0],
  'anon SELECT profile_visits: denied'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.user_saved_items $$,
  ARRAY[0],
  'anon SELECT user_saved_items: denied'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.vip_payments $$,
  ARRAY[0],
  'anon SELECT vip_payments: denied'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.follows $$,
  ARRAY[1],
  'anon SELECT follows: public graph visible'
);

-- stranger authenticated
SELECT tests.authenticate_as('soc_stranger');

SELECT throws_ok(
  $$ INSERT INTO public.reports (reporter_id, target_type, target_id, reason)
     VALUES (tests.get_supabase_uid('soc_a'), 'profile', gen_random_uuid(), 'spam') $$,
  '42501',
  'authenticated INSERT reports as another user: denied'
);

SELECT lives_ok(
  $$ INSERT INTO public.reports (reporter_id, target_type, target_id, reason)
     VALUES (auth.uid(), 'profile', tests.get_supabase_uid('soc_a'), 'spam') $$,
  'authenticated INSERT reports as self: allowed'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.reports $$,
  ARRAY[0],
  'authenticated SELECT reports: denied (no read policy)'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.vip_payments $$,
  ARRAY[0],
  'stranger SELECT vip_payments: hidden'
);

SELECT throws_ok(
  $$ INSERT INTO public.user_saved_items (user_id, resource_type, resource_id)
     SELECT tests.get_supabase_uid('soc_b'), 'freelancer', fp.id
     FROM public.freelancer_profiles fp WHERE fp.slug = 'soc-a' $$,
  '42501',
  'stranger INSERT user_saved_items for another user: denied'
);

-- owner soc_b: saved items, vip payments, profile visits to own viewed freelancer
SELECT tests.authenticate_as('soc_b');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.user_saved_items WHERE user_id = auth.uid() $$,
  ARRAY[1],
  'owner SELECT user_saved_items: own bookmarks visible'
);

SELECT lives_ok(
  $$ DELETE FROM public.user_saved_items WHERE user_id = auth.uid() $$,
  'owner DELETE user_saved_items: allowed'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.vip_payments WHERE user_id = auth.uid() $$,
  ARRAY[1],
  'owner SELECT vip_payments: own payment rows visible'
);

SELECT throws_ok(
  $$ INSERT INTO public.vip_payments (listing_id, user_id, tier, paypal_order_id, amount)
     SELECT j.id, auth.uid(), 'silver', 'PAY-TEST-2', 20 FROM public.jobs j LIMIT 1 $$,
  '42501',
  'client INSERT vip_payments: denied (RPC/Edge only)'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.profile_visits pv
     JOIN public.freelancer_profiles fp ON fp.id = pv.freelancer_profile_id
     WHERE fp.user_id = tests.get_supabase_uid('soc_a') $$,
  ARRAY[0],
  'hirer SELECT profile_visits to freelancer profile: denied (owner is freelancer, not hirer row owner)'
);

-- freelancer profile owner sees visits to their profile
SELECT tests.authenticate_as('soc_a');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.profile_visits pv
     JOIN public.freelancer_profiles fp ON fp.id = pv.freelancer_profile_id
     WHERE fp.user_id = auth.uid() $$,
  ARRAY[2],
  'freelancer owner SELECT profile_visits: visits to own profile visible'
);

SELECT lives_ok(
  $$ INSERT INTO public.forum_posts (author_id, author_name, category, subcategory, title, body)
     VALUES (auth.uid(), 'Soc A', 'general', 'intro', 'Second post', 'More') $$,
  'forum author INSERT forum_posts: allowed'
);

SELECT results_eq(
  $$ WITH ins AS (
       INSERT INTO public.forum_posts (author_id, author_name, category, subcategory, title, body)
       VALUES (auth.uid(), 'Hira Support', 'general', 'intro', 'Spoof attempt', 'x')
       RETURNING author_name
     ) SELECT count(*)::int FROM ins WHERE author_name = 'Hira Support' $$,
  ARRAY[0],
  'forum author_name: client-supplied name ignored (taken from profile)'
);

SELECT results_eq(
  $$ WITH u AS (
       UPDATE public.forum_posts SET title = 'Hacked' WHERE author_id = tests.get_supabase_uid('soc_b') RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'non-author UPDATE forum_posts: denied'
);

SELECT * FROM finish();
ROLLBACK;
