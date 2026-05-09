-- Speed up public portfolio listings (completed_jobs + RPC filters).

CREATE INDEX IF NOT EXISTS completed_jobs_freelancer_completed_at_idx
  ON public.completed_jobs (freelancer_profile_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS service_inquiries_freelancer_completed_at_idx
  ON public.service_inquiries (freelancer_profile_id, status, completed_at DESC);
