-- Extra CV fields stored in user_cvs (profile-driven editor; no AI)
ALTER TABLE public.user_cvs
  ADD COLUMN IF NOT EXISTS languages text[] DEFAULT '{}'::text[];

ALTER TABLE public.user_cvs
  ADD COLUMN IF NOT EXISTS github_url text;

ALTER TABLE public.user_cvs
  ADD COLUMN IF NOT EXISTS portfolio_url text;

ALTER TABLE public.user_cvs
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(12, 2);

ALTER TABLE public.user_cvs
  ADD COLUMN IF NOT EXISTS avatar_url text;
