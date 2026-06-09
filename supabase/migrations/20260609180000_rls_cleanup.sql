-- RLS cleanup: drop dead policies identified in supabase/rls-audit.md (2026-06-01).

-- notifications INSERT is revoked for authenticated; this policy is unreachable.
DROP POLICY IF EXISTS notif_insert_own ON public.notifications;

-- Idempotent RLS enable for all public marketplace tables (no-op if already enabled).
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profiles', 'freelancer_profiles', 'hirer_profiles', 'jobs', 'job_applications',
    'job_skills', 'services', 'service_inquiries', 'skills', 'categories', 'subcategories',
    'experience', 'freelancer_skills', 'portfolio_items', 'freelancer_education',
    'completed_jobs', 'reviews', 'follows', 'reports', 'notifications', 'profile_visits',
    'user_cvs', 'user_saved_items', 'vip_payments', 'conversations', 'messages',
    'conversation_reads'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;
