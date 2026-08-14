-- RLS: conversations, messages, conversation_reads (private chat)
BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";
CREATE EXTENSION IF NOT EXISTS "supabase_test_helpers";

SELECT plan(17);

SELECT tests.create_supabase_user('chat_a');
SELECT tests.create_supabase_user('chat_b');
SELECT tests.create_supabase_user('chat_stranger');

SELECT tests.authenticate_as_service_role();

INSERT INTO public.conversations (participant_low, participant_high)
SELECT LEAST(tests.get_supabase_uid('chat_a'), tests.get_supabase_uid('chat_b')),
       GREATEST(tests.get_supabase_uid('chat_a'), tests.get_supabase_uid('chat_b'));

INSERT INTO public.messages (conversation_id, sender_id, body)
SELECT c.id, tests.get_supabase_uid('chat_a'), 'Hello there'
FROM public.conversations c
LIMIT 1;

-- anon: no access
SELECT tests.clear_authentication();

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.conversations $$,
  ARRAY[0],
  'anon SELECT conversations: denied'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.messages $$,
  ARRAY[0],
  'anon SELECT messages: denied'
);

SELECT throws_ok(
  $$ INSERT INTO public.messages (conversation_id, sender_id, body)
     SELECT id, gen_random_uuid(), 'spam' FROM public.conversations LIMIT 1 $$,
  '42501',
  'anon INSERT messages: denied'
);

-- stranger authenticated: cannot see thread
SELECT tests.authenticate_as('chat_stranger');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.conversations $$,
  ARRAY[0],
  'stranger SELECT conversations: denied'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.messages $$,
  ARRAY[0],
  'stranger SELECT messages: denied'
);

SELECT throws_ok(
  $$ INSERT INTO public.messages (conversation_id, sender_id, body)
     SELECT c.id, auth.uid(), 'intrude'
     FROM public.conversations c LIMIT 1 $$,
  '42501',
  'stranger INSERT messages: denied'
);

-- participant A
SELECT tests.authenticate_as('chat_a');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.conversations $$,
  ARRAY[1],
  'participant SELECT conversations: visible'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.messages $$,
  ARRAY[1],
  'participant SELECT messages: visible'
);

SELECT lives_ok(
  $$ INSERT INTO public.messages (conversation_id, sender_id, body)
     SELECT c.id, auth.uid(), 'Reply'
     FROM public.conversations c LIMIT 1 $$,
  'participant INSERT messages: allowed'
);

SELECT results_eq(
  $$ WITH u AS (
       UPDATE public.messages SET body = 'edited'
       WHERE sender_id = tests.get_supabase_uid('chat_b') RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'participant UPDATE others messages: denied (no policy)'
);

SELECT results_eq(
  $$ WITH u AS (DELETE FROM public.messages RETURNING 1) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'participant DELETE messages: denied (no policy)'
);

-- conversation_reads: participant can upsert own read state
SELECT lives_ok(
  $$ INSERT INTO public.conversation_reads (conversation_id, user_id)
     SELECT c.id, auth.uid() FROM public.conversations c LIMIT 1
     ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = now() $$,
  'participant INSERT conversation_reads: allowed'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.conversation_reads $$,
  ARRAY[1],
  'participant SELECT conversation_reads in thread: visible'
);

SELECT lives_ok(
  $$ UPDATE public.conversation_reads SET last_read_at = now() WHERE user_id = auth.uid() $$,
  'participant UPDATE own conversation_reads: allowed'
);

-- participant B sees reads in shared thread
SELECT tests.authenticate_as('chat_b');

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.conversation_reads $$,
  ARRAY[1],
  'other participant SELECT conversation_reads: visible (read receipts)'
);

SELECT results_eq(
  $$ WITH u AS (
       UPDATE public.conversation_reads SET last_read_at = now()
       WHERE user_id = tests.get_supabase_uid('chat_a') RETURNING 1
     ) SELECT count(*)::int FROM u $$,
  ARRAY[0],
  'non-owner UPDATE conversation_reads: denied'
);

-- conversations: no direct client INSERT policy (RPC-only creation)
SELECT throws_ok(
  $$ INSERT INTO public.conversations (participant_low, participant_high)
     VALUES (auth.uid(), tests.get_supabase_uid('chat_a')) $$,
  '42501',
  'participant direct INSERT conversations: denied'
);

SELECT * FROM finish();
ROLLBACK;
