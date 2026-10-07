-- Hiring tools and re-engagement:
--   A. job_applications: proposed_rate column + hirer-only shortlist flag.
--   B. get_job_applicants_compare(): side-by-side applicant data for the job owner
--      (rating, rate, response time, portfolio, skill match).
--   C. job_invitations + invite_freelancer_to_job(): hirer invites a freelancer to apply.
--   D. Stale job reminders: open jobs with no applicants for 7 days nudge the hirer
--      (close / raise budget / keep open); after 3 ignored reminders the job is closed.
--   E. Weekly digest now covers activity too ("who viewed your profile", listing/job views)
--      and goes to hirers as well as freelancers.

-- ── A. Applications: proposed rate + shortlist ──────────────────────────────
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS proposed_rate numeric,
  ADD COLUMN IF NOT EXISTS is_shortlisted boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_proposed_rate_range'
  ) THEN
    ALTER TABLE public.job_applications
      ADD CONSTRAINT job_applications_proposed_rate_range
      CHECK (proposed_rate IS NULL OR (proposed_rate >= 0 AND proposed_rate <= 10000000));
  END IF;
END $$;

-- Backfill the rate from the legacy cover-note line ("შემოთავაზებული ტარიფი: ₾123").
UPDATE public.job_applications
SET proposed_rate = substring(cover_note FROM 'შემოთავაზებული ტარიფი: ₾([0-9]+(?:\.[0-9]+)?)')::numeric
WHERE proposed_rate IS NULL
  AND cover_note ~ 'შემოთავაზებული ტარიფი: ₾[0-9]';

GRANT UPDATE (is_shortlisted) ON public.job_applications TO authenticated;

-- Same rules as round 3, plus: only the hirer may (un)shortlist.
CREATE OR REPLACE FUNCTION public.job_applications_enforce_update_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.jobs j
    INNER JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
    WHERE j.id = OLD.job_id
      AND hp.user_id = v_uid
  ) THEN
    IF NEW.deleted_by_freelancer IS DISTINCT FROM OLD.deleted_by_freelancer THEN
      RAISE EXCEPTION 'Hirers cannot change deleted_by_freelancer' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.deleted_by_hirer IS DISTINCT FROM OLD.deleted_by_hirer
     OR NEW.is_shortlisted IS DISTINCT FROM OLD.is_shortlisted THEN
    RAISE EXCEPTION 'Applicants may only hide their own application' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.job_applications_enforce_update_columns() FROM PUBLIC, anon, authenticated;

-- Round 6 insert pinning, plus the shortlist flag.
CREATE OR REPLACE FUNCTION public.job_applications_pin_insert_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_job record;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  NEW.status := 'pending';
  NEW.cancel_requested_by := NULL;
  NEW.deleted_by_hirer := false;
  NEW.deleted_by_freelancer := false;
  NEW.is_shortlisted := false;
  NEW.created_at := now();

  SELECT j.status, j.expires_at, j.application_deadline, hp.user_id AS hirer_user_id
  INTO v_job
  FROM public.jobs j
  JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
  WHERE j.id = NEW.job_id;

  IF NOT FOUND
     OR v_job.status <> 'open'
     OR (v_job.expires_at IS NOT NULL AND v_job.expires_at <= now())
     OR (v_job.application_deadline IS NOT NULL AND v_job.application_deadline < CURRENT_DATE) THEN
    RAISE EXCEPTION 'This job is not accepting applications' USING ERRCODE = '42501';
  END IF;

  IF v_job.hirer_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot apply to your own job' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ── B. Applicant comparison ─────────────────────────────────────────────────
-- Median minutes between the other party starting a turn in a chat and this user's reply
-- (last 90 days). NULL until there are at least 2 answered turns. Internal helper only.
CREATE OR REPLACE FUNCTION public.user_median_response_minutes(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH msgs AS (
    SELECT
      m.conversation_id,
      m.sender_id,
      m.created_at,
      lag(m.sender_id) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) AS prev_sender
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE (c.participant_low = p_user_id OR c.participant_high = p_user_id)
      AND m.created_at > now() - interval '90 days'
  ),
  turns AS (
    SELECT conversation_id, created_at AS asked_at
    FROM msgs
    WHERE sender_id <> p_user_id
      AND (prev_sender IS NULL OR prev_sender = p_user_id)
  ),
  answered AS (
    SELECT
      extract(epoch FROM (
        (
          SELECT min(m2.created_at)
          FROM public.messages m2
          WHERE m2.conversation_id = t.conversation_id
            AND m2.sender_id = p_user_id
            AND m2.created_at > t.asked_at
        ) - t.asked_at
      )) / 60.0 AS minutes
    FROM turns t
  )
  SELECT CASE
    WHEN count(minutes) >= 2
      THEN round(percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes))::integer
    ELSE NULL
  END
  FROM answered
  WHERE minutes IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.user_median_response_minutes(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_job_applicants_compare(p_job_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_job record;
  result json;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT j.id, j.title, j.budget_min, j.budget_max, j.budget_type, j.status
  INTO v_job
  FROM public.jobs j
  JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
  WHERE j.id = p_job_id AND hp.user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the job owner can compare applicants' USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(
    'job', json_build_object(
      'id', v_job.id,
      'title', v_job.title,
      'budget_min', v_job.budget_min,
      'budget_max', v_job.budget_max,
      'budget_type', v_job.budget_type,
      'status', v_job.status,
      'skill_count', (SELECT count(*) FROM public.job_skills js WHERE js.job_id = v_job.id)
    ),
    'applicants', coalesce((
      SELECT json_agg(x ORDER BY x.is_shortlisted DESC, x.created_at ASC)
      FROM (
        SELECT
          ja.id AS application_id,
          ja.status,
          ja.is_shortlisted,
          ja.created_at,
          ja.cover_note,
          ja.proposed_rate,
          fp.id AS freelancer_profile_id,
          fp.user_id AS freelancer_user_id,
          fp.slug,
          fp.professional_title,
          fp.average_rating,
          fp.total_reviews_count,
          fp.completed_jobs_count,
          fp.is_accepting_new_work,
          p.full_name,
          p.avatar_url,
          p.city,
          p.is_verified,
          (SELECT count(*) FROM public.portfolio_items pi WHERE pi.freelancer_profile_id = fp.id) AS portfolio_count,
          (
            SELECT coalesce(json_agg(pi.image_url ORDER BY pi.sort_order, pi.created_at), '[]'::json)
            FROM (
              SELECT image_url, sort_order, created_at
              FROM public.portfolio_items
              WHERE freelancer_profile_id = fp.id
              ORDER BY sort_order, created_at
              LIMIT 3
            ) pi
          ) AS portfolio_thumbs,
          (
            SELECT count(*)
            FROM public.job_skills js
            JOIN public.freelancer_skills fs ON fs.skill_id = js.skill_id AND fs.freelancer_profile_id = fp.id
            WHERE js.job_id = v_job.id
          ) AS skill_match,
          public.user_median_response_minutes(fp.user_id) AS response_minutes
        FROM public.job_applications ja
        JOIN public.freelancer_profiles fp ON fp.id = ja.freelancer_profile_id
        JOIN public.profiles p ON p.id = fp.user_id
        WHERE ja.job_id = v_job.id
          AND coalesce(ja.deleted_by_hirer, false) = false
        LIMIT 100
      ) x
    ), '[]'::json)
  )
  INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_job_applicants_compare(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_job_applicants_compare(uuid) TO authenticated;

-- ── C. Invite to apply ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  freelancer_profile_id uuid NOT NULL REFERENCES public.freelancer_profiles (id) ON DELETE CASCADE,
  hirer_profile_id uuid NOT NULL REFERENCES public.hirer_profiles (id) ON DELETE CASCADE,
  message text CHECK (message IS NULL OR char_length(message) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, freelancer_profile_id)
);

CREATE INDEX IF NOT EXISTS job_invitations_hirer_created_idx
  ON public.job_invitations (hirer_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_invitations_freelancer_idx
  ON public.job_invitations (freelancer_profile_id, created_at DESC);

ALTER TABLE public.job_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.job_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.job_invitations TO authenticated;

-- Both sides can see invitations they are part of; writes only go through the RPC.
DROP POLICY IF EXISTS job_invitations_select_party ON public.job_invitations;
CREATE POLICY job_invitations_select_party
  ON public.job_invitations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hirer_profiles hp
      WHERE hp.id = job_invitations.hirer_profile_id AND hp.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.freelancer_profiles fp
      WHERE fp.id = job_invitations.freelancer_profile_id AND fp.user_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.invite_freelancer_to_job(
  p_job_id uuid,
  p_freelancer_profile_id uuid,
  p_message text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_job record;
  v_fp record;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_recent integer;
  v_inviter text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT j.id, j.title, j.status, j.expires_at, j.application_deadline, hp.id AS hirer_profile_id,
         coalesce(nullif(btrim(hp.company_name), ''), nullif(btrim(p.full_name), ''), 'დამქირავებელი') AS hirer_label
  INTO v_job
  FROM public.jobs j
  JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
  JOIN public.profiles p ON p.id = hp.user_id
  WHERE j.id = p_job_id AND hp.user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the job owner can invite' USING ERRCODE = '42501';
  END IF;

  IF v_job.status <> 'open'
     OR (v_job.expires_at IS NOT NULL AND v_job.expires_at <= now())
     OR (v_job.application_deadline IS NOT NULL AND v_job.application_deadline < CURRENT_DATE) THEN
    RETURN 'job_closed';
  END IF;

  SELECT fp.id, fp.user_id
  INTO v_fp
  FROM public.freelancer_profiles fp
  WHERE fp.id = p_freelancer_profile_id AND fp.is_public = true;

  IF NOT FOUND OR v_fp.user_id = v_uid THEN
    RAISE EXCEPTION 'Freelancer not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_message IS NOT NULL AND char_length(v_message) > 500 THEN
    RAISE EXCEPTION 'Message too long' USING ERRCODE = '22001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.job_applications ja
    WHERE ja.job_id = p_job_id AND ja.freelancer_profile_id = p_freelancer_profile_id
  ) THEN
    RETURN 'already_applied';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.job_invitations ji
    WHERE ji.job_id = p_job_id AND ji.freelancer_profile_id = p_freelancer_profile_id
  ) THEN
    RETURN 'already_invited';
  END IF;

  -- Anti-spam: at most 30 invitations per hirer per 24h.
  SELECT count(*) INTO v_recent
  FROM public.job_invitations ji
  WHERE ji.hirer_profile_id = v_job.hirer_profile_id
    AND ji.created_at > now() - interval '24 hours';
  IF v_recent >= 30 THEN
    RETURN 'rate_limited';
  END IF;

  INSERT INTO public.job_invitations (job_id, freelancer_profile_id, hirer_profile_id, message)
  VALUES (p_job_id, p_freelancer_profile_id, v_job.hirer_profile_id, v_message);

  v_inviter := v_job.hirer_label;

  INSERT INTO public.notifications (user_id, title, body, link, type, is_read, payload)
  VALUES (
    v_fp.user_id,
    left(v_inviter || ' გიწვევს სამუშაოზე', 200),
    left(
      '„' || v_job.title || '“ - ' || coalesce(v_message, 'დამქირავებელს მოეწონა შენი პროფილი და გთხოვს, გამოაგზავნო შეთავაზება.'),
      2000
    ),
    '/job/' || p_job_id::text,
    'job_invitation',
    false,
    jsonb_build_object('job_id', p_job_id, 'hirer_profile_id', v_job.hirer_profile_id)
  );

  RETURN 'invited';
END;
$$;

REVOKE ALL ON FUNCTION public.invite_freelancer_to_job(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_freelancer_to_job(uuid, uuid, text) TO authenticated;

-- ── D. Stale job reminders ──────────────────────────────────────────────────
-- stale_clock_at: when the "no response" clock last restarted (NULL = created_at).
-- Restarted by a reminder, by "keep open", and by editing the budget/title/description.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS stale_clock_at timestamptz,
  ADD COLUMN IF NOT EXISTS stale_reminders_sent integer NOT NULL DEFAULT 0;

-- Round 5 system-column protection, extended to the stale bookkeeping columns.
CREATE OR REPLACE FUNCTION public.protect_job_system_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_vip := false;
    NEW.vip_tier := NULL;
    NEW.vip_expires_at := NULL;
    NEW.is_featured := false;
    NEW.views_count := 0;
    NEW.stale_clock_at := NULL;
    NEW.stale_reminders_sent := 0;
  ELSE
    NEW.is_vip := OLD.is_vip;
    NEW.vip_tier := OLD.vip_tier;
    NEW.vip_expires_at := OLD.vip_expires_at;
    NEW.is_featured := OLD.is_featured;
    NEW.views_count := OLD.views_count;
    -- Editing what applicants see restarts the clock; otherwise the columns are system-owned.
    IF NEW.budget_min IS DISTINCT FROM OLD.budget_min
       OR NEW.budget_max IS DISTINCT FROM OLD.budget_max
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description THEN
      NEW.stale_clock_at := now();
      NEW.stale_reminders_sent := 0;
    ELSE
      NEW.stale_clock_at := OLD.stale_clock_at;
      NEW.stale_reminders_sent := OLD.stale_reminders_sent;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_job_system_columns() FROM PUBLIC, anon, authenticated;

-- Hirer clicked "keep it open": restart the clock without editing the job.
CREATE OR REPLACE FUNCTION public.keep_job_open(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.jobs j
  SET stale_clock_at = now(), stale_reminders_sent = 0
  FROM public.hirer_profiles hp
  WHERE j.id = p_job_id
    AND hp.id = j.hirer_profile_id
    AND hp.user_id = auth.uid()
    AND j.status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.keep_job_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.keep_job_open(uuid) TO authenticated;

-- Daily: remind hirers about open jobs with no applicants for 7 days; close after 3 ignored reminders.
-- Runs as the cron owner, so the protection trigger above does not interfere.
CREATE OR REPLACE FUNCTION public.process_stale_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT j.id, j.title, j.stale_reminders_sent, hp.user_id AS hirer_user_id
    FROM public.jobs j
    JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
    WHERE j.status = 'open'
      AND coalesce(j.stale_clock_at, j.created_at) < now() - interval '7 days'
      AND (j.expires_at IS NULL OR j.expires_at > now())
      AND NOT EXISTS (
        SELECT 1 FROM public.job_applications ja
        WHERE ja.job_id = j.id AND coalesce(ja.deleted_by_hirer, false) = false
      )
    ORDER BY coalesce(j.stale_clock_at, j.created_at)
    LIMIT 500
    FOR UPDATE OF j SKIP LOCKED
  LOOP
    IF r.stale_reminders_sent >= 3 THEN
      UPDATE public.jobs SET status = 'closed', stale_clock_at = now() WHERE id = r.id;
      INSERT INTO public.notifications (user_id, title, body, link, type, is_read, payload)
      VALUES (
        r.hirer_user_id,
        'განცხადება დაიხურა',
        left('„' || r.title || '“ ერთ თვეზე მეტხანს განმცხადებლის გარეშე დარჩა და ავტომატურად დაიხურა. შეგიძლია ხელახლა განათავსო ან დაარედაქტირო.', 2000),
        '/dashboard',
        'stale_job_closed',
        false,
        jsonb_build_object('job_id', r.id)
      );
    ELSE
      UPDATE public.jobs
      SET stale_clock_at = now(), stale_reminders_sent = r.stale_reminders_sent + 1
      WHERE id = r.id;
      INSERT INTO public.notifications (user_id, title, body, link, type, is_read, payload)
      VALUES (
        r.hirer_user_id,
        'შენს განცხადებას ჯერ განმცხადებელი არ ჰყავს',
        left('„' || r.title || '“ - 7 დღეა არავის გამოუგზავნია შეთავაზება. გაზარდე ბიუჯეტი, დახურე განცხადება, ან მოიწვიე ფრილანსერები პირდაპირ.', 2000),
        '/dashboard',
        'stale_job_reminder',
        false,
        jsonb_build_object('job_id', r.id)
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.process_stale_jobs() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'stale-job-reminders';
    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;
    -- 07:00 UTC = 11:00 Tbilisi.
    PERFORM cron.schedule('stale-job-reminders', '0 7 * * *', 'SELECT public.process_stale_jobs();');
  END IF;
END $$;

-- ── E. Weekly digest with activity ──────────────────────────────────────────
-- views_count is cumulative; the digest diffs it against the value seen last week.
CREATE TABLE IF NOT EXISTS public.digest_view_snapshots (
  item_kind text NOT NULL CHECK (item_kind IN ('job', 'service')),
  item_id uuid NOT NULL,
  views_count integer NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_kind, item_id)
);

ALTER TABLE public.digest_view_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.digest_view_snapshots FROM PUBLIC, anon, authenticated;

-- Activity for one user over the last 7 days, and advances that user's view snapshots.
CREATE OR REPLACE FUNCTION public.weekly_activity_for_user(p_user_id uuid, p_user_type text)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - interval '7 days';
  v_fp_id uuid;
  v_hp_id uuid;
  v_items json;
  result json;
BEGIN
  IF p_user_type = 'freelancer' THEN
    SELECT id INTO v_fp_id FROM freelancer_profiles WHERE user_id = p_user_id;
    IF v_fp_id IS NULL THEN
      RETURN NULL;
    END IF;

    WITH items AS (
      SELECT s.id, s.title, s.views_count, s.created_at, snap.views_count AS prev
      FROM services s
      LEFT JOIN digest_view_snapshots snap ON snap.item_kind = 'service' AND snap.item_id = s.id
      WHERE s.freelancer_profile_id = v_fp_id AND s.is_active = true
    ),
    deltas AS (
      SELECT id, title,
        CASE
          WHEN prev IS NOT NULL THEN greatest(views_count - prev, 0)
          WHEN created_at > v_since THEN views_count
          ELSE 0
        END AS views
      FROM items
    )
    SELECT coalesce(json_agg(json_build_object('id', id, 'title', title, 'views', views) ORDER BY views DESC), '[]'::json)
    INTO v_items
    FROM (SELECT * FROM deltas WHERE views > 0 ORDER BY views DESC LIMIT 3) d;

    INSERT INTO digest_view_snapshots AS snap (item_kind, item_id, views_count, taken_at)
    SELECT 'service', s.id, s.views_count, now()
    FROM services s WHERE s.freelancer_profile_id = v_fp_id
    ON CONFLICT (item_kind, item_id) DO UPDATE SET views_count = EXCLUDED.views_count, taken_at = now();

    SELECT json_build_object(
      'profile_views', (SELECT count(*) FROM profile_visits WHERE freelancer_profile_id = v_fp_id AND created_at >= v_since),
      'profile_views_prev', (
        SELECT count(*) FROM profile_visits
        WHERE freelancer_profile_id = v_fp_id AND created_at >= v_since - interval '7 days' AND created_at < v_since
      ),
      'search_impressions', (
        SELECT coalesce(sum(impressions), 0) FROM freelancer_search_impressions_daily
        WHERE freelancer_profile_id = v_fp_id AND day >= v_since::date
      ),
      'hirer_viewer_count', (
        SELECT count(DISTINCT pv.visitor_user_id)
        FROM profile_visits pv
        JOIN hirer_profiles hp ON hp.user_id = pv.visitor_user_id
        WHERE pv.freelancer_profile_id = v_fp_id AND pv.created_at >= v_since
      ),
      'hirer_viewers', (
        SELECT coalesce(json_agg(x.label), '[]'::json)
        FROM (
          SELECT coalesce(nullif(btrim(hp.company_name), ''), nullif(btrim(p.full_name), '')) AS label, max(pv.created_at) AS last_at
          FROM profile_visits pv
          JOIN hirer_profiles hp ON hp.user_id = pv.visitor_user_id
          JOIN profiles p ON p.id = hp.user_id
          WHERE pv.freelancer_profile_id = v_fp_id AND pv.created_at >= v_since
          GROUP BY 1
          HAVING coalesce(nullif(btrim(hp.company_name), ''), nullif(btrim(p.full_name), '')) IS NOT NULL
          ORDER BY max(pv.created_at) DESC
          LIMIT 3
        ) x
      ),
      'listings', v_items
    ) INTO result;
    RETURN result;
  END IF;

  IF p_user_type = 'hirer' THEN
    SELECT id INTO v_hp_id FROM hirer_profiles WHERE user_id = p_user_id;
    IF v_hp_id IS NULL THEN
      RETURN NULL;
    END IF;

    WITH items AS (
      SELECT j.id, j.title, j.views_count, j.created_at, snap.views_count AS prev,
        (SELECT count(*) FROM job_applications ja WHERE ja.job_id = j.id AND ja.created_at >= v_since) AS new_applicants,
        (SELECT count(*) FROM job_applications ja WHERE ja.job_id = j.id AND ja.status = 'pending'
           AND coalesce(ja.deleted_by_hirer, false) = false) AS pending_applicants,
        (SELECT count(*) FROM job_applications ja WHERE ja.job_id = j.id AND coalesce(ja.deleted_by_hirer, false) = false) AS total_applicants
      FROM jobs j
      LEFT JOIN digest_view_snapshots snap ON snap.item_kind = 'job' AND snap.item_id = j.id
      WHERE j.hirer_profile_id = v_hp_id AND j.status = 'open'
    ),
    deltas AS (
      SELECT id, title, new_applicants, pending_applicants, total_applicants,
        CASE
          WHEN prev IS NOT NULL THEN greatest(views_count - prev, 0)
          WHEN created_at > v_since THEN views_count
          ELSE 0
        END AS views
      FROM items
    )
    SELECT coalesce(json_agg(json_build_object(
      'id', id, 'title', title, 'views', views,
      'new_applicants', new_applicants, 'pending_applicants', pending_applicants,
      'total_applicants', total_applicants
    ) ORDER BY new_applicants DESC, views DESC), '[]'::json)
    INTO v_items
    FROM (SELECT * FROM deltas ORDER BY new_applicants DESC, views DESC LIMIT 5) d;

    INSERT INTO digest_view_snapshots AS snap (item_kind, item_id, views_count, taken_at)
    SELECT 'job', j.id, j.views_count, now()
    FROM jobs j WHERE j.hirer_profile_id = v_hp_id
    ON CONFLICT (item_kind, item_id) DO UPDATE SET views_count = EXCLUDED.views_count, taken_at = now();

    SELECT json_build_object(
      'profile_views', (SELECT count(*) FROM profile_visits WHERE hirer_profile_id = v_hp_id AND created_at >= v_since),
      'jobs', v_items
    ) INTO result;
    RETURN result;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.weekly_activity_for_user(uuid, text) FROM PUBLIC, anon, authenticated;

-- Return type changes (user_type + activity), so the old signature has to go first.
DROP FUNCTION IF EXISTS public.claim_weekly_digest_batch(integer);

CREATE FUNCTION public.claim_weekly_digest_batch(p_limit integer DEFAULT 50)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  user_type text,
  job_count integer,
  jobs json,
  activity json
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  lim integer := greatest(1, least(coalesce(p_limit, 50), 200));
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT p.id
    FROM profiles p
    WHERE p.user_type IN ('freelancer', 'hirer')
      AND p.is_active = true
      AND p.weekly_digest_enabled = true
      AND (p.weekly_digest_sent_at IS NULL OR p.weekly_digest_sent_at < now() - interval '6 days')
    ORDER BY p.weekly_digest_sent_at NULLS FIRST
    LIMIT lim
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE profiles p
    SET weekly_digest_sent_at = now()
    FROM due
    WHERE p.id = due.id
    RETURNING p.id, p.full_name, p.user_type
  ),
  freelancer AS (
    SELECT c.id AS uid, fp.id AS fp_id
    FROM claimed c
    JOIN freelancer_profiles fp ON fp.user_id = c.id
    WHERE c.user_type = 'freelancer'
  ),
  matches AS (
    SELECT
      f.uid,
      j.id,
      j.title,
      j.budget_type,
      j.budget_min,
      j.budget_max,
      j.location_type,
      j.created_at,
      (
        SELECT count(*)
        FROM job_skills js
        JOIN freelancer_skills fs ON fs.skill_id = js.skill_id AND fs.freelancer_profile_id = f.fp_id
        WHERE js.job_id = j.id
      ) AS overlap
    FROM freelancer f
    JOIN jobs j
      ON j.status = 'open'
     AND j.created_at > now() - interval '7 days'
     AND (j.expires_at IS NULL OR j.expires_at > now())
     AND (
       EXISTS (
         SELECT 1
         FROM job_skills js
         JOIN freelancer_skills fs ON fs.skill_id = js.skill_id AND fs.freelancer_profile_id = f.fp_id
         WHERE js.job_id = j.id
       )
       OR j.category_id IN (
         SELECT c.id
         FROM freelancer_skills fs
         JOIN skills sk ON sk.id = fs.skill_id
         JOIN categories c ON c.id = sk.category_id OR c.id = (SELECT pc.parent_id FROM categories pc WHERE pc.id = sk.category_id)
         WHERE fs.freelancer_profile_id = f.fp_id
       )
     )
    WHERE NOT EXISTS (
      SELECT 1 FROM job_applications ja WHERE ja.job_id = j.id AND ja.freelancer_profile_id = f.fp_id
    )
  )
  SELECT
    c.id,
    u.email::text,
    c.full_name,
    c.user_type,
    (SELECT count(*)::int FROM matches m WHERE m.uid = c.id),
    (
      SELECT coalesce(json_agg(x), '[]'::json)
      FROM (
        SELECT m.id, m.title, m.budget_type, m.budget_min, m.budget_max, m.location_type
        FROM matches m
        WHERE m.uid = c.id
        ORDER BY m.overlap DESC, m.created_at DESC
        LIMIT 5
      ) x
    ),
    public.weekly_activity_for_user(c.id, c.user_type)
  FROM claimed c
  JOIN auth.users u ON u.id = c.id
  WHERE u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_weekly_digest_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_weekly_digest_batch(integer) TO service_role;

COMMENT ON COLUMN public.profiles.weekly_digest_enabled IS
  'Weekly email: matching jobs + profile/listing activity (freelancers), job views and applicants (hirers).';
