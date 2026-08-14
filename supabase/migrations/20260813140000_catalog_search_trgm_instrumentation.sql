-- Trigram indexes for catalog substring search + instrumentation for FTS vs fallback path usage.
--
-- Manual EXPLAIN ANALYZE (psql / Supabase SQL editor)
-- ---------------------------------------------------
-- 1. Verify trigram GIN is used for substring match (replace 'developer' with a real term):
--
--    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
--    SELECT j.id
--    FROM public.jobs j
--    WHERE j.status = 'open'
--      AND (j.expires_at IS NULL OR j.expires_at > now())
--      AND 'developer' <% coalesce(j.title, '');
--
--    Expect: Bitmap Index Scan on jobs_title_trgm_idx (not Seq Scan).
--
-- 2. Compare FTS vs fallback plans for the same term:
--
--    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
--    SELECT j.id FROM public.jobs j
--    WHERE j.search_vector @@ websearch_to_tsquery('simple', 'developer');
--
-- 3. Per-term match-path breakdown (no writes):
--
--    SELECT public.analyze_catalog_search_paths('jobs', 'developer');
--    SELECT public.analyze_catalog_search_paths('listings', 'designer');
--
-- Live sampling (optional, GUC-gated — runs extra COUNT queries per search)
-- -------------------------------------------------------------------------
--    SET app.instrument_catalog_search = 'on';
--    SELECT public.get_jobs_page('partial-substr');
--    SELECT * FROM public.catalog_search_path_samples ORDER BY recorded_at DESC LIMIT 20;
--    RESET app.instrument_catalog_search;
--
-- Always-on daily counters (cheap; no extra COUNT queries):
--    SELECT * FROM public.catalog_search_path_daily ORDER BY day DESC;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Substring match via pg_trgm word similarity (GIN-index friendly); ILIKE kept for very short needles.
CREATE OR REPLACE FUNCTION public.text_substring_trgm_match(p_haystack text, p_needle text)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public, extensions
AS $$
  SELECT
    nullif(trim(p_needle), '') IS NULL
    OR (
      length(trim(p_needle)) < 3
      AND coalesce(p_haystack, '') ILIKE ('%' || trim(p_needle) || '%')
    )
    OR (
      length(trim(p_needle)) >= 3
      AND trim(p_needle) <% coalesce(p_haystack, '')
    );
$$;

REVOKE ALL ON FUNCTION public.text_substring_trgm_match(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.text_substring_trgm_match(text, text) TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS jobs_title_trgm_idx
  ON public.jobs USING gin (title extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS jobs_title_en_trgm_idx
  ON public.jobs USING gin (title_en extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS jobs_description_trgm_idx
  ON public.jobs USING gin (description extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS jobs_description_en_trgm_idx
  ON public.jobs USING gin (description_en extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS services_title_trgm_idx
  ON public.services USING gin (title extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS services_title_en_trgm_idx
  ON public.services USING gin (title_en extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS services_description_trgm_idx
  ON public.services USING gin (description extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS services_description_en_trgm_idx
  ON public.services USING gin (description_en extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS profiles_full_name_trgm_idx
  ON public.profiles USING gin (full_name extensions.gin_trgm_ops);

-- Lightweight always-on counters (one upsert per catalog search RPC call).
CREATE TABLE IF NOT EXISTS public.catalog_search_path_daily (
  day date NOT NULL,
  catalog text NOT NULL CHECK (catalog IN ('jobs', 'listings')),
  search_calls bigint NOT NULL DEFAULT 0,
  tsquery_null_calls bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (day, catalog)
);

REVOKE ALL ON TABLE public.catalog_search_path_daily FROM PUBLIC;
GRANT SELECT ON TABLE public.catalog_search_path_daily TO service_role;

CREATE OR REPLACE FUNCTION public.bump_catalog_search_path_daily(
  p_catalog text,
  p_tsquery_null boolean
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.catalog_search_path_daily (day, catalog, search_calls, tsquery_null_calls)
  VALUES (
    current_date,
    p_catalog,
    1,
    CASE WHEN p_tsquery_null THEN 1 ELSE 0 END
  )
  ON CONFLICT (day, catalog) DO UPDATE SET
    search_calls = catalog_search_path_daily.search_calls + 1,
    tsquery_null_calls = catalog_search_path_daily.tsquery_null_calls
      + CASE WHEN p_tsquery_null THEN 1 ELSE 0 END;
$$;

REVOKE ALL ON FUNCTION public.bump_catalog_search_path_daily(text, boolean) FROM PUBLIC;

-- Optional detailed samples when app.instrument_catalog_search = 'on'.
CREATE TABLE IF NOT EXISTS public.catalog_search_path_samples (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  catalog text NOT NULL CHECK (catalog IN ('jobs', 'listings')),
  search_term text NOT NULL,
  tsquery_valid boolean NOT NULL,
  fts_match_count integer NOT NULL,
  trgm_match_count integer NOT NULL,
  trgm_only_match_count integer NOT NULL
);

REVOKE ALL ON TABLE public.catalog_search_path_samples FROM PUBLIC;
GRANT SELECT ON TABLE public.catalog_search_path_samples TO service_role;

CREATE OR REPLACE FUNCTION public.record_catalog_search_path_sample_jobs(
  p_search text,
  p_q tsquery,
  p_category_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cat text := nullif(trim(p_category_id), '');
  v_fts integer := 0;
  v_trgm integer := 0;
  v_trgm_only integer := 0;
BEGIN
  IF p_q IS NOT NULL THEN
    SELECT count(*)::int INTO v_fts
    FROM public.jobs j
    WHERE j.status = 'open'
      AND (j.expires_at IS NULL OR j.expires_at > now())
      AND (
        cat IS NULL
        OR j.category_id::text = cat
        OR j.subcategory_id IN (
          SELECT sc2.id FROM public.subcategories sc2 WHERE sc2.category_id::text = cat
        )
      )
      AND j.search_vector @@ p_q;
  END IF;

  SELECT count(*)::int INTO v_trgm
  FROM public.jobs j
  WHERE j.status = 'open'
    AND (j.expires_at IS NULL OR j.expires_at > now())
    AND (
      cat IS NULL
      OR j.category_id::text = cat
      OR j.subcategory_id IN (
        SELECT sc2.id FROM public.subcategories sc2 WHERE sc2.category_id::text = cat
      )
    )
    AND (
      public.text_substring_trgm_match(j.title, p_search)
      OR public.text_substring_trgm_match(j.title_en, p_search)
      OR public.text_substring_trgm_match(j.description, p_search)
      OR public.text_substring_trgm_match(j.description_en, p_search)
    );

  IF p_q IS NOT NULL THEN
    SELECT count(*)::int INTO v_trgm_only
    FROM public.jobs j
    WHERE j.status = 'open'
      AND (j.expires_at IS NULL OR j.expires_at > now())
      AND (
        cat IS NULL
        OR j.category_id::text = cat
        OR j.subcategory_id IN (
          SELECT sc2.id FROM public.subcategories sc2 WHERE sc2.category_id::text = cat
        )
      )
      AND (
        public.text_substring_trgm_match(j.title, p_search)
        OR public.text_substring_trgm_match(j.title_en, p_search)
        OR public.text_substring_trgm_match(j.description, p_search)
        OR public.text_substring_trgm_match(j.description_en, p_search)
      )
      AND NOT (j.search_vector @@ p_q);
  ELSE
    v_trgm_only := v_trgm;
  END IF;

  INSERT INTO public.catalog_search_path_samples (
    catalog,
    search_term,
    tsquery_valid,
    fts_match_count,
    trgm_match_count,
    trgm_only_match_count
  )
  VALUES (
    'jobs',
    left(p_search, 200),
    p_q IS NOT NULL,
    v_fts,
    v_trgm,
    v_trgm_only
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_catalog_search_path_sample_listings(
  p_search text,
  p_q tsquery
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fts integer := 0;
  v_trgm integer := 0;
  v_trgm_only integer := 0;
BEGIN
  IF p_q IS NOT NULL THEN
    SELECT count(*)::int INTO v_fts
    FROM public.services sv
    JOIN public.freelancer_profiles fp ON fp.id = sv.freelancer_profile_id
    JOIN public.profiles p ON p.id = fp.user_id
    WHERE sv.is_active = true
      AND fp.is_public = true
      AND sv.search_vector @@ p_q;
  END IF;

  SELECT count(*)::int INTO v_trgm
  FROM public.services sv
  JOIN public.freelancer_profiles fp ON fp.id = sv.freelancer_profile_id
  JOIN public.profiles p ON p.id = fp.user_id
  WHERE sv.is_active = true
    AND fp.is_public = true
    AND (
      public.text_substring_trgm_match(sv.title, p_search)
      OR public.text_substring_trgm_match(sv.title_en, p_search)
      OR public.text_substring_trgm_match(sv.description, p_search)
      OR public.text_substring_trgm_match(sv.description_en, p_search)
      OR public.text_substring_trgm_match(p.full_name, p_search)
    );

  IF p_q IS NOT NULL THEN
    SELECT count(*)::int INTO v_trgm_only
    FROM public.services sv
    JOIN public.freelancer_profiles fp ON fp.id = sv.freelancer_profile_id
    JOIN public.profiles p ON p.id = fp.user_id
    WHERE sv.is_active = true
      AND fp.is_public = true
      AND (
        public.text_substring_trgm_match(sv.title, p_search)
        OR public.text_substring_trgm_match(sv.title_en, p_search)
        OR public.text_substring_trgm_match(sv.description, p_search)
        OR public.text_substring_trgm_match(sv.description_en, p_search)
        OR public.text_substring_trgm_match(p.full_name, p_search)
      )
      AND NOT (sv.search_vector @@ p_q);
  ELSE
    v_trgm_only := v_trgm;
  END IF;

  INSERT INTO public.catalog_search_path_samples (
    catalog,
    search_term,
    tsquery_valid,
    fts_match_count,
    trgm_match_count,
    trgm_only_match_count
  )
  VALUES (
    'listings',
    left(p_search, 200),
    p_q IS NOT NULL,
    v_fts,
    v_trgm,
    v_trgm_only
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_catalog_search_path_sample_jobs(text, tsquery, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_catalog_search_path_sample_listings(text, tsquery) FROM PUBLIC;

-- Ad-hoc path breakdown + EXPLAIN snippets for a single search term (read-only diagnostic).
CREATE OR REPLACE FUNCTION public.analyze_catalog_search_paths(
  p_catalog text,
  p_search text,
  p_category_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  search_trim text := nullif(trim(p_search), '');
  q tsquery := NULL;
  cat text := nullif(trim(p_category_id), '');
  v_fts integer := 0;
  v_trgm integer := 0;
  v_trgm_only integer := 0;
  v_jobs_fts_plan text;
  v_jobs_trgm_plan text;
  v_listings_fts_plan text;
  v_listings_trgm_plan text;
BEGIN
  IF search_trim IS NULL THEN
    RETURN json_build_object(
      'error', 'p_search is empty',
      'catalog', p_catalog
    );
  END IF;

  IF p_catalog NOT IN ('jobs', 'listings') THEN
    RETURN json_build_object('error', 'p_catalog must be jobs or listings');
  END IF;

  BEGIN
    q := websearch_to_tsquery('simple', search_trim);
  EXCEPTION
    WHEN OTHERS THEN
      q := NULL;
  END;

  IF p_catalog = 'jobs' THEN
    IF q IS NOT NULL THEN
      SELECT count(*)::int INTO v_fts
      FROM public.jobs j
      WHERE j.status = 'open'
        AND (j.expires_at IS NULL OR j.expires_at > now())
        AND (
          cat IS NULL
          OR j.category_id::text = cat
          OR j.subcategory_id IN (
            SELECT sc2.id FROM public.subcategories sc2 WHERE sc2.category_id::text = cat
          )
        )
        AND j.search_vector @@ q;

      SELECT coalesce(string_agg(plan_line, E'\n'), '') INTO v_jobs_fts_plan
      FROM (
        EXPLAIN (FORMAT TEXT)
        SELECT j.id
        FROM public.jobs j
        WHERE j.status = 'open'
          AND (j.expires_at IS NULL OR j.expires_at > now())
          AND j.search_vector @@ websearch_to_tsquery('simple', search_trim)
        LIMIT 20
      ) plans(plan_line);
    END IF;

    SELECT count(*)::int INTO v_trgm
    FROM public.jobs j
    WHERE j.status = 'open'
      AND (j.expires_at IS NULL OR j.expires_at > now())
      AND (
        cat IS NULL
        OR j.category_id::text = cat
        OR j.subcategory_id IN (
          SELECT sc2.id FROM public.subcategories sc2 WHERE sc2.category_id::text = cat
        )
      )
      AND (
        public.text_substring_trgm_match(j.title, search_trim)
        OR public.text_substring_trgm_match(j.title_en, search_trim)
        OR public.text_substring_trgm_match(j.description, search_trim)
        OR public.text_substring_trgm_match(j.description_en, search_trim)
      );

    IF q IS NOT NULL THEN
      SELECT count(*)::int INTO v_trgm_only
      FROM public.jobs j
      WHERE j.status = 'open'
        AND (j.expires_at IS NULL OR j.expires_at > now())
        AND (
          cat IS NULL
          OR j.category_id::text = cat
          OR j.subcategory_id IN (
            SELECT sc2.id FROM public.subcategories sc2 WHERE sc2.category_id::text = cat
          )
        )
        AND (
          public.text_substring_trgm_match(j.title, search_trim)
          OR public.text_substring_trgm_match(j.title_en, search_trim)
          OR public.text_substring_trgm_match(j.description, search_trim)
          OR public.text_substring_trgm_match(j.description_en, search_trim)
        )
        AND NOT (j.search_vector @@ q);
    ELSE
      v_trgm_only := v_trgm;
    END IF;

    SELECT coalesce(string_agg(plan_line, E'\n'), '') INTO v_jobs_trgm_plan
    FROM (
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT j.id
      FROM public.jobs j
      WHERE j.status = 'open'
        AND (j.expires_at IS NULL OR j.expires_at > now())
        AND public.text_substring_trgm_match(j.title, search_trim)
      LIMIT 20
    ) plans(plan_line);

    RETURN json_build_object(
      'catalog', 'jobs',
      'search', search_trim,
      'category_id', cat,
      'tsquery_valid', q IS NOT NULL,
      'tsquery', q::text,
      'fts_match_count', v_fts,
      'trgm_match_count', v_trgm,
      'trgm_only_match_count', v_trgm_only,
      'trgm_only_ratio',
        CASE WHEN v_trgm > 0 THEN round(v_trgm_only::numeric / v_trgm, 4) ELSE 0 END,
      'explain_fts_plan', v_jobs_fts_plan,
      'explain_trgm_plan', v_jobs_trgm_plan
    );
  END IF;

  -- listings
  IF q IS NOT NULL THEN
    SELECT count(*)::int INTO v_fts
    FROM public.services sv
    JOIN public.freelancer_profiles fp ON fp.id = sv.freelancer_profile_id
    JOIN public.profiles p ON p.id = fp.user_id
    WHERE sv.is_active = true
      AND fp.is_public = true
      AND sv.search_vector @@ q;

    SELECT coalesce(string_agg(plan_line, E'\n'), '') INTO v_listings_fts_plan
    FROM (
      EXPLAIN (FORMAT TEXT)
      SELECT sv.id
      FROM public.services sv
      WHERE sv.is_active = true
        AND sv.search_vector @@ websearch_to_tsquery('simple', search_trim)
      LIMIT 20
    ) plans(plan_line);
  END IF;

  SELECT count(*)::int INTO v_trgm
  FROM public.services sv
  JOIN public.freelancer_profiles fp ON fp.id = sv.freelancer_profile_id
  JOIN public.profiles p ON p.id = fp.user_id
  WHERE sv.is_active = true
    AND fp.is_public = true
    AND (
      public.text_substring_trgm_match(sv.title, search_trim)
      OR public.text_substring_trgm_match(sv.title_en, search_trim)
      OR public.text_substring_trgm_match(sv.description, search_trim)
      OR public.text_substring_trgm_match(sv.description_en, search_trim)
      OR public.text_substring_trgm_match(p.full_name, search_trim)
    );

  IF q IS NOT NULL THEN
    SELECT count(*)::int INTO v_trgm_only
    FROM public.services sv
    JOIN public.freelancer_profiles fp ON fp.id = sv.freelancer_profile_id
    JOIN public.profiles p ON p.id = fp.user_id
    WHERE sv.is_active = true
      AND fp.is_public = true
      AND (
        public.text_substring_trgm_match(sv.title, search_trim)
        OR public.text_substring_trgm_match(sv.title_en, search_trim)
        OR public.text_substring_trgm_match(sv.description, search_trim)
        OR public.text_substring_trgm_match(sv.description_en, search_trim)
        OR public.text_substring_trgm_match(p.full_name, search_trim)
      )
      AND NOT (sv.search_vector @@ q);
  ELSE
    v_trgm_only := v_trgm;
  END IF;

  SELECT coalesce(string_agg(plan_line, E'\n'), '') INTO v_listings_trgm_plan
  FROM (
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT sv.id
    FROM public.services sv
    WHERE sv.is_active = true
      AND public.text_substring_trgm_match(sv.title, search_trim)
    LIMIT 20
  ) plans(plan_line);

  RETURN json_build_object(
    'catalog', 'listings',
    'search', search_trim,
    'tsquery_valid', q IS NOT NULL,
    'tsquery', q::text,
    'fts_match_count', v_fts,
    'trgm_match_count', v_trgm,
    'trgm_only_match_count', v_trgm_only,
    'trgm_only_ratio',
      CASE WHEN v_trgm > 0 THEN round(v_trgm_only::numeric / v_trgm, 4) ELSE 0 END,
    'explain_fts_plan', v_listings_fts_plan,
    'explain_trgm_plan', v_listings_trgm_plan
  );
END;
$$;

REVOKE ALL ON FUNCTION public.analyze_catalog_search_paths(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analyze_catalog_search_paths(text, text, text) TO service_role;

-- get_jobs_page: same signature; ILIKE fallback replaced with trigram match + instrumentation.
CREATE OR REPLACE FUNCTION public.get_jobs_page(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_category_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer := greatest(1, least(coalesce(nullif(p_limit, 0), 20), 100));
  off integer := greatest(0, coalesce(p_offset, 0));
  cat text := nullif(trim(p_category_id), '');
  search_trim text := nullif(trim(p_search), '');
  q tsquery := NULL;
  result json;
BEGIN
  IF search_trim IS NOT NULL THEN
    BEGIN
      q := websearch_to_tsquery('simple', search_trim);
    EXCEPTION
      WHEN OTHERS THEN
        q := NULL;
    END;
  END IF;

  SELECT json_build_object(
    'jobs', (
      SELECT COALESCE(json_agg(j), '[]'::json)
      FROM (
        SELECT
          j.id,
          j.category_id,
          j.subcategory_id,
          j.title,
          j.title_en,
          j.description,
          j.description_en,
          COALESCE(j.image_urls, ARRAY[]::text[]) AS image_urls,
          j.created_at,
          j.budget_type,
          j.budget_min,
          j.budget_max,
          j.location_type,
          j.duration_type,
          j.is_urgent,
          j.application_deadline,
          j.views_count,
          j.is_vip,
          j.vip_expires_at,
          j.vacancies,
          j.accepted_count,
          hp.company_name,
          p.full_name,
          p.avatar_url,
          p.city,
          COALESCE(NULLIF(trim(c.name_ka), ''), NULLIF(trim(c.name_en), ''), 'კატეგორია') AS category_name,
          CASE
            WHEN sc.id IS NULL THEN NULL
            ELSE COALESCE(NULLIF(trim(sc.name_ka), ''), NULLIF(trim(sc.name_en), ''), NULL)
          END AS subcategory_name,
          COALESCE(
            (
              SELECT count(*)::int
              FROM job_applications ja
              WHERE ja.job_id = j.id
            ),
            0
          ) AS applicants_count,
          (
            SELECT json_agg(json_build_object('id', sk.id, 'name', sk.name))
            FROM job_skills js
            JOIN skills sk ON sk.id = js.skill_id AND sk.is_approved = true
            WHERE js.job_id = j.id
          ) AS skills
        FROM jobs j
        JOIN hirer_profiles hp ON hp.id = j.hirer_profile_id
        JOIN profiles p ON p.id = hp.user_id
        LEFT JOIN categories c ON c.id = j.category_id
        LEFT JOIN subcategories sc ON sc.id = j.subcategory_id
        WHERE j.status = 'open'
          AND (j.expires_at IS NULL OR j.expires_at > now())
          AND (
            cat IS NULL
            OR j.category_id::text = cat
            OR j.subcategory_id IN (
              SELECT sc2.id FROM subcategories sc2 WHERE sc2.category_id::text = cat
            )
          )
          AND (
            search_trim IS NULL
            OR (q IS NOT NULL AND j.search_vector @@ q)
            OR public.text_substring_trgm_match(j.title, search_trim)
            OR public.text_substring_trgm_match(j.title_en, search_trim)
            OR public.text_substring_trgm_match(j.description, search_trim)
            OR public.text_substring_trgm_match(j.description_en, search_trim)
          )
        ORDER BY
          CASE
            WHEN j.is_vip = true
              AND j.vip_expires_at IS NOT NULL
              AND j.vip_expires_at > now()
            THEN 0
            ELSE 1
          END,
          CASE
            WHEN q IS NOT NULL THEN ts_rank(j.search_vector, q)
            ELSE 0::real
          END DESC,
          j.created_at DESC
        LIMIT lim
        OFFSET off
      ) j
    ),
    'total_count', (
      SELECT COUNT(*)::int
      FROM jobs j
      WHERE j.status = 'open'
        AND (j.expires_at IS NULL OR j.expires_at > now())
        AND (
          cat IS NULL
          OR j.category_id::text = cat
          OR j.subcategory_id IN (
            SELECT sc2.id FROM subcategories sc2 WHERE sc2.category_id::text = cat
          )
        )
        AND (
          search_trim IS NULL
          OR (q IS NOT NULL AND j.search_vector @@ q)
          OR public.text_substring_trgm_match(j.title, search_trim)
          OR public.text_substring_trgm_match(j.title_en, search_trim)
          OR public.text_substring_trgm_match(j.description, search_trim)
          OR public.text_substring_trgm_match(j.description_en, search_trim)
        )
    ),
    'categories', (
      SELECT COALESCE(json_agg(c ORDER BY c.sort_order), '[]'::json)
      FROM categories c
      WHERE c.is_active = true
    )
  )
  INTO result;

  IF search_trim IS NOT NULL THEN
    PERFORM public.bump_catalog_search_path_daily('jobs', q IS NULL);
    IF current_setting('app.instrument_catalog_search', true) = 'on' THEN
      PERFORM public.record_catalog_search_path_sample_jobs(search_trim, q, p_category_id);
    END IF;
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_jobs_page(text, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_jobs_page(text, integer, integer, text) TO anon, authenticated;

-- get_listings_page: same signature; ILIKE fallback replaced with trigram match + instrumentation.
CREATE OR REPLACE FUNCTION public.get_listings_page(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer := greatest(1, least(coalesce(nullif(p_limit, 0), 20), 100));
  off integer := greatest(0, coalesce(p_offset, 0));
  search_trim text := nullif(trim(p_search), '');
  q tsquery := NULL;
  result json;
BEGIN
  IF search_trim IS NOT NULL THEN
    BEGIN
      q := websearch_to_tsquery('simple', search_trim);
    EXCEPTION
      WHEN OTHERS THEN
        q := NULL;
    END;
  END IF;

  SELECT json_build_object(
    'services', (
      SELECT COALESCE(json_agg(s), '[]'::json)
      FROM (
        SELECT
          sv.id,
          sv.freelancer_profile_id,
          sv.title,
          sv.title_en,
          sv.description,
          sv.description_en,
          sv.price,
          sv.delivery_days,
          sv.views_count,
          sv.created_at,
          sv.is_vip,
          sv.vip_expires_at,
          fp.slug,
          fp.professional_title,
          fp.is_public,
          fp.bio,
          fp.availability,
          fp.is_accepting_new_work,
          fp.average_rating,
          fp.completed_jobs_count,
          p.full_name,
          p.avatar_url,
          p.city,
          (
            SELECT json_agg(json_build_object('id', sk.id, 'name', sk.name))
            FROM freelancer_skills fs
            JOIN skills sk ON sk.id = fs.skill_id
            WHERE fs.freelancer_profile_id = fp.id
          ) AS skills
        FROM services sv
        JOIN freelancer_profiles fp ON fp.id = sv.freelancer_profile_id
        JOIN profiles p ON p.id = fp.user_id
        WHERE sv.is_active = true
          AND fp.is_public = true
          AND (
            search_trim IS NULL
            OR (q IS NOT NULL AND sv.search_vector @@ q)
            OR public.text_substring_trgm_match(sv.title, search_trim)
            OR public.text_substring_trgm_match(sv.title_en, search_trim)
            OR public.text_substring_trgm_match(sv.description, search_trim)
            OR public.text_substring_trgm_match(sv.description_en, search_trim)
            OR public.text_substring_trgm_match(p.full_name, search_trim)
          )
        ORDER BY
          CASE
            WHEN sv.is_vip = true
              AND sv.vip_expires_at IS NOT NULL
              AND sv.vip_expires_at > now()
            THEN 0
            ELSE 1
          END,
          CASE
            WHEN q IS NOT NULL THEN ts_rank(sv.search_vector, q)
            ELSE 0::real
          END DESC,
          sv.created_at DESC
        LIMIT lim
        OFFSET off
      ) s
    ),
    'total_count', (
      SELECT COUNT(*)::int
      FROM services sv
      JOIN freelancer_profiles fp ON fp.id = sv.freelancer_profile_id
      JOIN profiles p ON p.id = fp.user_id
      WHERE sv.is_active = true
        AND fp.is_public = true
        AND (
          search_trim IS NULL
          OR (q IS NOT NULL AND sv.search_vector @@ q)
          OR public.text_substring_trgm_match(sv.title, search_trim)
          OR public.text_substring_trgm_match(sv.title_en, search_trim)
          OR public.text_substring_trgm_match(sv.description, search_trim)
          OR public.text_substring_trgm_match(sv.description_en, search_trim)
          OR public.text_substring_trgm_match(p.full_name, search_trim)
        )
    ),
    'categories', (
      SELECT COALESCE(json_agg(c ORDER BY c.sort_order), '[]'::json)
      FROM categories c
      WHERE c.is_active = true
    ),
    'skills', (
      SELECT COALESCE(json_agg(sk ORDER BY sk.name), '[]'::json)
      FROM skills sk
      WHERE sk.is_approved = true
    )
  )
  INTO result;

  IF search_trim IS NOT NULL THEN
    PERFORM public.bump_catalog_search_path_daily('listings', q IS NULL);
    IF current_setting('app.instrument_catalog_search', true) = 'on' THEN
      PERFORM public.record_catalog_search_path_sample_listings(search_trim, q);
    END IF;
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_listings_page(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_listings_page(text, integer, integer) TO anon, authenticated;
