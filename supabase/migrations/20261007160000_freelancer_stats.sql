-- Freelancer stats page (/dashboard/stats): profile views, search appearances, hirers who
-- viewed the profile, and rank within the freelancer's main category.

-- One counter row per freelancer per day; written only through record_search_impressions().
CREATE TABLE IF NOT EXISTS public.freelancer_search_impressions_daily (
  freelancer_profile_id uuid NOT NULL REFERENCES public.freelancer_profiles (id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT current_date,
  impressions integer NOT NULL DEFAULT 0,
  PRIMARY KEY (freelancer_profile_id, day)
);

ALTER TABLE public.freelancer_search_impressions_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.freelancer_search_impressions_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.freelancer_search_impressions_daily TO service_role;

-- Called by the browser when freelancer cards are shown in Browse / Listings results.
-- Capped per call and deduplicated; only public profiles are counted.
CREATE OR REPLACE FUNCTION public.record_search_impressions(p_freelancer_profile_ids uuid[])
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.freelancer_search_impressions_daily AS d (freelancer_profile_id, day, impressions)
  SELECT fp.id, current_date, 1
  FROM (
    SELECT DISTINCT unnest(p_freelancer_profile_ids[1:60]) AS id
  ) ids
  JOIN public.freelancer_profiles fp ON fp.id = ids.id AND fp.is_public = true
  ON CONFLICT (freelancer_profile_id, day) DO UPDATE SET impressions = d.impressions + 1;
$$;

REVOKE ALL ON FUNCTION public.record_search_impressions(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_search_impressions(uuid[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_freelancer_stats(p_days integer DEFAULT 30)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_days integer := greatest(7, least(coalesce(p_days, 30), 90));
  v_fp_id uuid;
  v_since timestamptz;
  v_prev_since timestamptz;
  v_category_id uuid;
  result json;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_fp_id FROM freelancer_profiles WHERE user_id = v_uid;
  IF v_fp_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_since := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_prev_since := v_since - make_interval(days => v_days);

  -- Main category: the mid-level category holding most of the freelancer's skills.
  SELECT sk.category_id INTO v_category_id
  FROM freelancer_skills fs
  JOIN skills sk ON sk.id = fs.skill_id
  WHERE fs.freelancer_profile_id = v_fp_id AND sk.category_id IS NOT NULL
  GROUP BY sk.category_id
  ORDER BY count(*) DESC, sk.category_id
  LIMIT 1;

  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(v_since::date, current_date, interval '1 day') d
  ),
  views AS (
    SELECT created_at::date AS day, count(*)::int AS n
    FROM profile_visits
    WHERE freelancer_profile_id = v_fp_id AND created_at >= v_since
    GROUP BY 1
  ),
  impressions AS (
    SELECT day, impressions AS n
    FROM freelancer_search_impressions_daily
    WHERE freelancer_profile_id = v_fp_id AND day >= v_since::date
  ),
  peers AS (
    SELECT DISTINCT fs.freelancer_profile_id AS id
    FROM freelancer_skills fs
    JOIN skills sk ON sk.id = fs.skill_id
    JOIN freelancer_profiles fp ON fp.id = fs.freelancer_profile_id
    WHERE sk.category_id = v_category_id AND (fp.is_public = true OR fp.id = v_fp_id)
  ),
  peer_views AS (
    SELECT
      peers.id,
      (
        SELECT count(*)
        FROM profile_visits pv
        WHERE pv.freelancer_profile_id = peers.id AND pv.created_at >= v_since
      ) AS n
    FROM peers
  )
  SELECT json_build_object(
    'days', v_days,
    'daily', (
      SELECT json_agg(json_build_object(
        'day', days.day,
        'views', coalesce(v.n, 0),
        'impressions', coalesce(i.n, 0)
      ) ORDER BY days.day)
      FROM days
      LEFT JOIN views v ON v.day = days.day
      LEFT JOIN impressions i ON i.day = days.day
    ),
    'totals', json_build_object(
      'views', (SELECT count(*) FROM profile_visits WHERE freelancer_profile_id = v_fp_id AND created_at >= v_since),
      'views_prev', (
        SELECT count(*) FROM profile_visits
        WHERE freelancer_profile_id = v_fp_id AND created_at >= v_prev_since AND created_at < v_since
      ),
      'impressions', (
        SELECT coalesce(sum(impressions), 0) FROM freelancer_search_impressions_daily
        WHERE freelancer_profile_id = v_fp_id AND day >= v_since::date
      ),
      'impressions_prev', (
        SELECT coalesce(sum(impressions), 0) FROM freelancer_search_impressions_daily
        WHERE freelancer_profile_id = v_fp_id AND day >= v_prev_since::date AND day < v_since::date
      ),
      'hirer_visitors', (
        SELECT count(DISTINCT pv.visitor_user_id)
        FROM profile_visits pv
        JOIN hirer_profiles hp ON hp.user_id = pv.visitor_user_id
        WHERE pv.freelancer_profile_id = v_fp_id AND pv.created_at >= v_since
      ),
      'anonymous_views', (
        SELECT count(*) FROM profile_visits
        WHERE freelancer_profile_id = v_fp_id AND created_at >= v_since AND visitor_user_id IS NULL
      )
    ),
    -- Hirers (businesses looking to hire) who opened the profile; freelancer visitors stay private.
    'hirer_visitors', (
      SELECT coalesce(json_agg(x ORDER BY x.visited_at DESC), '[]'::json)
      FROM (
        SELECT
          hp.id AS hirer_profile_id,
          p.full_name,
          p.avatar_url,
          nullif(trim(hp.company_name), '') AS company_name,
          max(pv.created_at) AS visited_at,
          count(*)::int AS visits
        FROM profile_visits pv
        JOIN hirer_profiles hp ON hp.user_id = pv.visitor_user_id
        JOIN profiles p ON p.id = hp.user_id
        WHERE pv.freelancer_profile_id = v_fp_id AND pv.created_at >= v_since
        GROUP BY hp.id, p.full_name, p.avatar_url, hp.company_name
        ORDER BY max(pv.created_at) DESC
        LIMIT 10
      ) x
    ),
    'category_rank', CASE WHEN v_category_id IS NULL THEN NULL ELSE (
      SELECT json_build_object(
        'name_ka', c.name_ka,
        'name_en', c.name_en,
        'slug', public.landing_category_short_slug(c.slug, pc.slug),
        'total', (SELECT count(*) FROM peer_views),
        'rank', (
          SELECT 1 + count(*) FROM peer_views pvw
          WHERE pvw.n > (SELECT n FROM peer_views WHERE id = v_fp_id)
        )
      )
      FROM categories c
      LEFT JOIN categories pc ON pc.id = c.parent_id
      WHERE c.id = v_category_id
    ) END
  )
  INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_freelancer_stats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_freelancer_stats(integer) TO authenticated;
