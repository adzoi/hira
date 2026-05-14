-- Dashboard live updates: listing inquiries + job applications (RLS limits events per user).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'service_inquiries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_inquiries;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'job_applications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.job_applications;
  END IF;
END $$;
