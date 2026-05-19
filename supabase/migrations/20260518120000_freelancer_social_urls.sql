-- Additional freelancer social profile URLs (Facebook, Instagram, TikTok, YouTube, X).

ALTER TABLE public.freelancer_profiles
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS tiktok_url text,
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS x_url text;

COMMENT ON COLUMN public.freelancer_profiles.facebook_url IS 'Public Facebook profile or page URL.';
COMMENT ON COLUMN public.freelancer_profiles.instagram_url IS 'Public Instagram profile URL.';
COMMENT ON COLUMN public.freelancer_profiles.tiktok_url IS 'Public TikTok profile URL.';
COMMENT ON COLUMN public.freelancer_profiles.youtube_url IS 'Public YouTube channel or profile URL.';
COMMENT ON COLUMN public.freelancer_profiles.x_url IS 'Public X (Twitter) profile URL.';
