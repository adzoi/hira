-- Baseline marketplace schema for local Supabase / CI (idempotent on existing projects).
-- Incremental migrations in this repo assume these tables and core RLS policies exist.
--
-- Existing remote projects that already have this schema: mark this migration applied
-- without executing it to avoid resetting live policies:
--   supabase migration repair --status applied 20260501000000

-- ── profiles ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  user_type text NOT NULL DEFAULT 'freelancer',
  avatar_url text,
  city text,
  phone text,
  cv_url text,
  is_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  is_online boolean NOT NULL DEFAULT false,
  member_since date NOT NULL DEFAULT CURRENT_DATE,
  unread_messages_count integer NOT NULL DEFAULT 0,
  unread_notifications_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_public ON public.profiles;
CREATE POLICY profiles_select_public
  ON public.profiles FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO public
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

GRANT SELECT, UPDATE ON public.profiles TO anon, authenticated;

-- ── freelancer / hirer profiles ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.freelancer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  professional_title text,
  bio text,
  availability text,
  languages text[] NOT NULL DEFAULT '{}',
  linkedin_url text,
  github_url text,
  facebook_url text,
  instagram_url text,
  tiktok_url text,
  youtube_url text,
  x_url text,
  portfolio_url text,
  is_public boolean NOT NULL DEFAULT false,
  is_profile_complete boolean NOT NULL DEFAULT false,
  is_accepting_new_work boolean NOT NULL DEFAULT true,
  show_completed_work_on_public_profile boolean NOT NULL DEFAULT true,
  average_rating numeric NOT NULL DEFAULT 0,
  total_reviews_count integer NOT NULL DEFAULT 0,
  completed_jobs_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hirer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  company_name text,
  industry text,
  description text,
  website_url text,
  average_rating_given numeric NOT NULL DEFAULT 0,
  completed_jobs_count integer NOT NULL DEFAULT 0,
  jobs_posted_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.freelancer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hirer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fp_select_public ON public.freelancer_profiles;
CREATE POLICY fp_select_public
  ON public.freelancer_profiles FOR SELECT TO public
  USING (is_public IS TRUE OR user_id = auth.uid());

DROP POLICY IF EXISTS fp_insert_own ON public.freelancer_profiles;
CREATE POLICY fp_insert_own
  ON public.freelancer_profiles FOR INSERT TO public
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS fp_update_own ON public.freelancer_profiles;
CREATE POLICY fp_update_own
  ON public.freelancer_profiles FOR UPDATE TO public
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS fp_delete_own ON public.freelancer_profiles;
CREATE POLICY fp_delete_own
  ON public.freelancer_profiles FOR DELETE TO public
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS hp_select_public ON public.hirer_profiles;
CREATE POLICY hp_select_public
  ON public.hirer_profiles FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS hp_insert_own ON public.hirer_profiles;
CREATE POLICY hp_insert_own
  ON public.hirer_profiles FOR INSERT TO public
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS hp_update_own ON public.hirer_profiles;
CREATE POLICY hp_update_own
  ON public.hirer_profiles FOR UPDATE TO public
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS hp_delete_own ON public.hirer_profiles;
CREATE POLICY hp_delete_own
  ON public.hirer_profiles FOR DELETE TO public
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.freelancer_profiles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hirer_profiles TO anon, authenticated;

-- ── reference catalogs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_ka text NOT NULL,
  icon text,
  parent_id uuid REFERENCES public.categories (id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE CASCADE,
  slug text NOT NULL,
  name_en text NOT NULL,
  name_ka text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug)
);

CREATE TABLE IF NOT EXISTS public.skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category_id uuid REFERENCES public.categories (id) ON DELETE SET NULL,
  is_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_select ON public.categories;
CREATE POLICY categories_select ON public.categories FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS subcategories_select ON public.subcategories;
CREATE POLICY subcategories_select ON public.subcategories FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS skills_select ON public.skills;
CREATE POLICY skills_select ON public.skills FOR SELECT TO public USING (is_approved IS TRUE);

GRANT SELECT ON public.categories, public.subcategories, public.skills TO anon, authenticated;

-- ── jobs / services ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hirer_profile_id uuid NOT NULL REFERENCES public.hirer_profiles (id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories (id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES public.subcategories (id) ON DELETE SET NULL,
  title text NOT NULL,
  title_en text,
  description text NOT NULL,
  description_en text,
  budget_type text NOT NULL DEFAULT 'fixed',
  budget_min numeric,
  budget_max numeric,
  duration_type text NOT NULL DEFAULT 'one_time',
  location_type text NOT NULL DEFAULT 'remote',
  contact_preference text NOT NULL DEFAULT 'platform',
  status text NOT NULL DEFAULT 'open',
  is_featured boolean NOT NULL DEFAULT false,
  is_urgent boolean NOT NULL DEFAULT false,
  is_vip boolean NOT NULL DEFAULT false,
  vip_tier text,
  vip_expires_at timestamptz,
  views_count integer NOT NULL DEFAULT 0,
  accepted_count integer NOT NULL DEFAULT 0,
  vacancies integer NOT NULL DEFAULT 1,
  image_urls text[] NOT NULL DEFAULT '{}',
  application_deadline timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_profile_id uuid NOT NULL REFERENCES public.freelancer_profiles (id) ON DELETE CASCADE,
  title text NOT NULL,
  title_en text,
  description text,
  description_en text,
  price numeric NOT NULL DEFAULT 0,
  price_type text NOT NULL DEFAULT 'fixed',
  delivery_days integer,
  is_active boolean NOT NULL DEFAULT true,
  is_vip boolean NOT NULL DEFAULT false,
  vip_expires_at timestamptz,
  views_count integer NOT NULL DEFAULT 0,
  image_urls text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, skill_id)
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jobs_insert_hirer ON public.jobs;
CREATE POLICY jobs_insert_hirer
  ON public.jobs FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = jobs.hirer_profile_id AND hp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS jobs_update_own ON public.jobs;
CREATE POLICY jobs_update_own
  ON public.jobs FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = jobs.hirer_profile_id AND hp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = jobs.hirer_profile_id AND hp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS jobs_delete_own ON public.jobs;
CREATE POLICY jobs_delete_own
  ON public.jobs FOR DELETE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = jobs.hirer_profile_id AND hp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS services_select ON public.services;
CREATE POLICY services_select
  ON public.services FOR SELECT TO public
  USING (
    is_active IS TRUE
    AND EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = services.freelancer_profile_id AND fp.is_public IS TRUE
    )
  );

DROP POLICY IF EXISTS services_insert ON public.services;
CREATE POLICY services_insert
  ON public.services FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = services.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS services_update ON public.services;
CREATE POLICY services_update
  ON public.services FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = services.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = services.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS services_delete ON public.services;
CREATE POLICY services_delete
  ON public.services FOR DELETE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = services.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS job_skills_select ON public.job_skills;
CREATE POLICY job_skills_select ON public.job_skills FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS job_skills_insert ON public.job_skills;
CREATE POLICY job_skills_insert
  ON public.job_skills FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
      WHERE j.id = job_skills.job_id AND hp.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO anon, authenticated;
GRANT SELECT, INSERT ON public.job_skills TO anon, authenticated;

-- ── applications / inquiries ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  freelancer_profile_id uuid NOT NULL REFERENCES public.freelancer_profiles (id) ON DELETE CASCADE,
  cover_note text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, freelancer_profile_id)
);

CREATE TABLE IF NOT EXISTS public.service_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE CASCADE,
  hirer_profile_id uuid NOT NULL REFERENCES public.hirer_profiles (id) ON DELETE CASCADE,
  freelancer_profile_id uuid NOT NULL REFERENCES public.freelancer_profiles (id) ON DELETE CASCADE,
  message text NOT NULL,
  proposed_budget numeric,
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ja_select ON public.job_applications;
CREATE POLICY ja_select
  ON public.job_applications FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = job_applications.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ja_select_hirer ON public.job_applications;
CREATE POLICY ja_select_hirer
  ON public.job_applications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
      WHERE j.id = job_applications.job_id AND hp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ja_insert ON public.job_applications;
CREATE POLICY ja_insert
  ON public.job_applications FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = job_applications.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ja_update ON public.job_applications;
CREATE POLICY ja_update
  ON public.job_applications FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = job_applications.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = job_applications.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS si_hirer_insert_own ON public.service_inquiries;
CREATE POLICY si_hirer_insert_own
  ON public.service_inquiries FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = service_inquiries.hirer_profile_id AND hp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS si_hirer_select_own ON public.service_inquiries;
CREATE POLICY si_hirer_select_own
  ON public.service_inquiries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = service_inquiries.hirer_profile_id AND hp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS si_freelancer_select_own ON public.service_inquiries;
CREATE POLICY si_freelancer_select_own
  ON public.service_inquiries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = service_inquiries.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS si_select_hirer ON public.service_inquiries;
CREATE POLICY si_select_hirer
  ON public.service_inquiries FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = service_inquiries.hirer_profile_id AND hp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS si_select_freelancer ON public.service_inquiries;
CREATE POLICY si_select_freelancer
  ON public.service_inquiries FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = service_inquiries.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS si_hirer_update_own ON public.service_inquiries;
CREATE POLICY si_hirer_update_own
  ON public.service_inquiries FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = service_inquiries.hirer_profile_id AND hp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = service_inquiries.hirer_profile_id AND hp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS si_freelancer_update_own ON public.service_inquiries;
CREATE POLICY si_freelancer_update_own
  ON public.service_inquiries FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = service_inquiries.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = service_inquiries.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS si_update_hirer ON public.service_inquiries;
CREATE POLICY si_update_hirer
  ON public.service_inquiries FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = service_inquiries.hirer_profile_id AND hp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS si_update_freelancer ON public.service_inquiries;
CREATE POLICY si_update_freelancer
  ON public.service_inquiries FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = service_inquiries.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.job_applications TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.service_inquiries TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_job_participant(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_applications ja
    JOIN public.freelancer_profiles fp ON fp.id = ja.freelancer_profile_id
    WHERE ja.job_id = p_job_id
      AND fp.user_id = auth.uid()
      AND ja.status = 'accepted'
  );
$$;

REVOKE ALL ON FUNCTION public.is_job_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_job_participant(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS jobs_select ON public.jobs;
CREATE POLICY jobs_select
  ON public.jobs FOR SELECT TO public
  USING (
    status = 'open'
    OR EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = jobs.hirer_profile_id AND hp.user_id = auth.uid()
    )
    OR public.is_job_participant(jobs.id)
  );

-- ── completed work / reviews ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.completed_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.jobs (id) ON DELETE CASCADE,
  hirer_profile_id uuid NOT NULL REFERENCES public.hirer_profiles (id) ON DELETE CASCADE,
  freelancer_profile_id uuid NOT NULL REFERENCES public.freelancer_profiles (id) ON DELETE CASCADE,
  hirer_confirmed boolean NOT NULL DEFAULT false,
  freelancer_confirmed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  review_window_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  completed_job_id uuid REFERENCES public.completed_jobs (id) ON DELETE SET NULL,
  service_inquiry_id uuid REFERENCES public.service_inquiries (id) ON DELETE SET NULL,
  rating_overall smallint NOT NULL,
  rating_quality smallint NOT NULL,
  rating_communication smallint NOT NULL,
  rating_timeliness smallint NOT NULL,
  review_text text NOT NULL DEFAULT '',
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.completed_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cj_select ON public.completed_jobs;
CREATE POLICY cj_select
  ON public.completed_jobs FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = completed_jobs.hirer_profile_id AND hp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = completed_jobs.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS cj_select_participants ON public.completed_jobs;
CREATE POLICY cj_select_participants
  ON public.completed_jobs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = completed_jobs.hirer_profile_id AND hp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = completed_jobs.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS cj_insert_hirer ON public.completed_jobs;
CREATE POLICY cj_insert_hirer
  ON public.completed_jobs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
      WHERE j.id = completed_jobs.job_id
        AND hp.user_id = auth.uid()
        AND j.hirer_profile_id = completed_jobs.hirer_profile_id
    )
  );

DROP POLICY IF EXISTS cj_update ON public.completed_jobs;
CREATE POLICY cj_update
  ON public.completed_jobs FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = completed_jobs.hirer_profile_id AND hp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = completed_jobs.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = completed_jobs.hirer_profile_id AND hp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = completed_jobs.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Public read reviews for profile pages" ON public.reviews;
CREATE POLICY "Public read reviews for profile pages"
  ON public.reviews FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.user_id = reviews.reviewee_id AND fp.is_public IS TRUE
    )
    OR EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.user_id = reviews.reviewee_id
    )
  );

DROP POLICY IF EXISTS reviews_update ON public.reviews;
CREATE POLICY reviews_update
  ON public.reviews FOR UPDATE TO public
  USING (reviewer_id = auth.uid())
  WITH CHECK (reviewer_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.completed_jobs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.reviews TO anon, authenticated;

-- ── notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  link text,
  type text NOT NULL DEFAULT 'info',
  is_read boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_select ON public.notifications;
CREATE POLICY notif_select
  ON public.notifications FOR SELECT TO public
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notif_insert_own ON public.notifications;
CREATE POLICY notif_insert_own
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notif_update ON public.notifications;
CREATE POLICY notif_update
  ON public.notifications FOR UPDATE TO public
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notif_delete ON public.notifications;
CREATE POLICY notif_delete
  ON public.notifications FOR DELETE TO public
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO anon, authenticated;

-- ── social / moderation ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can see all follows" ON public.follows;
CREATE POLICY "users can see all follows"
  ON public.follows FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "users can follow others" ON public.follows;
CREATE POLICY "users can follow others"
  ON public.follows FOR INSERT TO public
  WITH CHECK (follower_id = auth.uid());

DROP POLICY IF EXISTS "users can unfollow" ON public.follows;
CREATE POLICY "users can unfollow"
  ON public.follows FOR DELETE TO public
  USING (follower_id = auth.uid());

DROP POLICY IF EXISTS reports_insert ON public.reports;
CREATE POLICY reports_insert
  ON public.reports FOR INSERT TO public
  WITH CHECK (reporter_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.follows TO anon, authenticated;
GRANT INSERT ON public.reports TO anon, authenticated;

-- ── freelancer sub-resources (used by hardening migrations) ───────────────────
CREATE TABLE IF NOT EXISTS public.experience (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_profile_id uuid NOT NULL REFERENCES public.freelancer_profiles (id) ON DELETE CASCADE,
  title text NOT NULL,
  organization text NOT NULL,
  type text NOT NULL DEFAULT 'full_time',
  start_date date NOT NULL,
  end_date date,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.freelancer_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_profile_id uuid NOT NULL REFERENCES public.freelancer_profiles (id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills (id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'intermediate',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (freelancer_profile_id, skill_id)
);

CREATE TABLE IF NOT EXISTS public.portfolio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_profile_id uuid NOT NULL REFERENCES public.freelancer_profiles (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  image_url text NOT NULL,
  project_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freelancer_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exp_select ON public.experience;
CREATE POLICY exp_select ON public.experience FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS exp_insert ON public.experience;
CREATE POLICY exp_insert
  ON public.experience FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = experience.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS exp_update ON public.experience;
CREATE POLICY exp_update
  ON public.experience FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = experience.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS exp_delete ON public.experience;
CREATE POLICY exp_delete
  ON public.experience FOR DELETE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = experience.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS fs_select_public ON public.freelancer_skills;
CREATE POLICY fs_select_public ON public.freelancer_skills FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS fs_insert_own ON public.freelancer_skills;
CREATE POLICY fs_insert_own
  ON public.freelancer_skills FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = freelancer_skills.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS fs_delete_own ON public.freelancer_skills;
CREATE POLICY fs_delete_own
  ON public.freelancer_skills FOR DELETE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = freelancer_skills.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS portfolio_select ON public.portfolio_items;
CREATE POLICY portfolio_select ON public.portfolio_items FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS portfolio_insert ON public.portfolio_items;
CREATE POLICY portfolio_insert
  ON public.portfolio_items FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = portfolio_items.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS portfolio_update ON public.portfolio_items;
CREATE POLICY portfolio_update
  ON public.portfolio_items FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = portfolio_items.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS portfolio_delete ON public.portfolio_items;
CREATE POLICY portfolio_delete
  ON public.portfolio_items FOR DELETE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = portfolio_items.freelancer_profile_id AND fp.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.experience TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.freelancer_skills TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_items TO anon, authenticated;

-- ── auth bootstrap ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, user_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'freelancer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
