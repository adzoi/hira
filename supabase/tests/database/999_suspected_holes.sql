-- SUSPECTED HOLES: policy introspection (informational; does not fail the suite on findings).
-- Review output in CI logs / `supabase test db` diagnostics before changing policies.
BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgtap";

SELECT plan(1);

DO $$
DECLARE
  r record;
  hole text;
  holes text[] := ARRAY[]::text[];
BEGIN
  -- UPDATE policies missing WITH CHECK (can fail open on column reassignment).
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'UPDATE'
      AND roles::text LIKE '%public%'
      AND with_check IS NULL
      AND tablename = ANY (ARRAY[
        'profiles', 'freelancer_profiles', 'hirer_profiles', 'services', 'jobs',
        'service_inquiries', 'job_applications', 'completed_jobs', 'reviews',
        'notifications', 'conversations', 'messages', 'conversation_reads',
        'forum_posts', 'forum_comments', 'follows', 'user_saved_items',
        'profile_visits', 'vip_payments', 'reports'
      ])
  LOOP
    holes := holes || format(
      'MISSING WITH CHECK: %I.%I policy %I allows UPDATE without WITH CHECK',
      r.schemaname, r.tablename, r.policyname
    );
  END LOOP;

  -- Permissive SELECT USING (true) on non-catalog tables.
  FOR r IN
    SELECT schemaname, tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'SELECT'
      AND qual = 'true'
      AND tablename = ANY (ARRAY[
        'profiles', 'freelancer_profiles', 'hirer_profiles', 'follows',
        'experience', 'freelancer_skills', 'portfolio_items', 'skills'
      ])
  LOOP
    holes := holes || format(
      'BROAD SELECT: %I.%I policy %I uses USING (true)',
      r.schemaname, r.tablename, r.policyname
    );
  END LOOP;

  -- Duplicate permissive UPDATE on service_inquiries (legacy + scoped pairs).
  IF (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_inquiries' AND cmd = 'UPDATE'
  ) >= 4 THEN
    holes := holes || 'DUPLICATE UPDATE POLICIES: service_inquiries has 4+ UPDATE policies (si_update_* OR-combined with scoped policies — verify WITH CHECK on all)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_inquiries'
      AND policyname IN ('si_update_hirer', 'si_update_freelancer')
      AND with_check IS NULL
  ) THEN
    holes := holes || 'FAIL-OPEN RISK: service_inquiries legacy si_update_* policies lack WITH CHECK (may allow cross-party column changes if USING matches)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'job_applications' AND policyname = 'ja_update'
  ) THEN
    holes := holes || 'REVIEW: job_applications.ja_update lets applicants UPDATE own rows (status transitions not constrained in DB — app layer only)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'follows'
      AND policyname = 'users can see all follows' AND qual = 'true'
  ) THEN
    holes := holes || 'INTENTIONAL EXPOSURE?: follows SELECT is world-readable (social graph / follower counts)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'notifications'
      AND privilege_type = 'INSERT' AND grantee = 'authenticated'
  ) THEN
    holes := holes || 'GRANT LEAK?: authenticated still has INSERT grant on notifications (policy alone should deny)';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'notifications'
      AND privilege_type = 'INSERT' AND grantee = 'authenticated'
  ) THEN
    holes := holes || 'OK: notifications INSERT revoked for authenticated (client must use RPC/triggers)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'skills' AND policyname = 'skills_select_public'
  ) THEN
    holes := holes || 'BROAD SELECT: skills_select_public USING (true) bypasses is_approved filter via OR with skills_select';
  END IF;

  PERFORM diag('');
  PERFORM diag('========== SUSPECTED HOLES (manual review — no auto-fix) ==========');

  IF array_length(holes, 1) IS NULL THEN
    PERFORM diag('No obvious fail-open patterns detected by static policy scan.');
  ELSE
    FOREACH hole IN ARRAY holes
    LOOP
      PERFORM diag(hole);
    END LOOP;
  END IF;

  PERFORM diag('===================================================================');
  PERFORM diag('');
END;
$$;

SELECT pass('Suspected holes reported via diag() above');

SELECT * FROM finish();
ROLLBACK;
