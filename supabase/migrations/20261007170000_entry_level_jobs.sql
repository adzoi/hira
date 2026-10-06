-- Students & first jobs: "beginner-friendly" flag and internships on job posts,
-- surfaced on job cards/detail, as /jobs filters, and on the /internships page.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS is_beginner_friendly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_internship boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.jobs.is_beginner_friendly IS 'Hirer marked the job as suitable for beginners / students.';
COMMENT ON COLUMN public.jobs.is_internship IS 'Job is an internship.';

CREATE INDEX IF NOT EXISTS idx_jobs_entry_level_open
  ON public.jobs (created_at DESC)
  WHERE status = 'open' AND (is_beginner_friendly OR is_internship);

-- get_jobs_page: unchanged except for the two new columns in each job row.
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
          j.is_beginner_friendly,
          j.is_internship,
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

-- /internships page: open internships and beginner-friendly jobs.
-- p_kind: 'internship' | 'beginner' | anything else = both.
CREATE OR REPLACE FUNCTION public.get_entry_level_jobs(
  p_kind text DEFAULT 'all',
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
  lim integer := greatest(1, least(coalesce(nullif(p_limit, 0), 20), 50));
  off integer := greatest(0, coalesce(p_offset, 0));
  v_kind text := coalesce(p_kind, 'all');
  result json;
BEGIN
  WITH matching AS (
    SELECT j.*
    FROM jobs j
    WHERE j.status = 'open'
      AND (j.expires_at IS NULL OR j.expires_at > now())
      AND (j.application_deadline IS NULL OR j.application_deadline >= CURRENT_DATE)
      AND CASE v_kind
        WHEN 'internship' THEN j.is_internship
        WHEN 'beginner' THEN j.is_beginner_friendly
        ELSE j.is_internship OR j.is_beginner_friendly
      END
  )
  SELECT json_build_object(
    'total_count', (SELECT count(*)::int FROM matching),
    'jobs', (
      SELECT coalesce(json_agg(r), '[]'::json)
      FROM (
        SELECT
          m.id,
          m.title,
          m.title_en,
          m.budget_type,
          m.budget_min,
          m.budget_max,
          m.location_type,
          m.created_at,
          m.is_internship,
          m.is_beginner_friendly,
          coalesce(nullif(trim(hp.company_name), ''), p.full_name) AS company_name,
          p.avatar_url,
          p.city,
          coalesce(nullif(trim(c.name_ka), ''), c.name_en) AS category_name_ka,
          c.name_en AS category_name_en
        FROM matching m
        JOIN hirer_profiles hp ON hp.id = m.hirer_profile_id
        JOIN profiles p ON p.id = hp.user_id
        LEFT JOIN categories c ON c.id = m.category_id
        ORDER BY m.created_at DESC
        LIMIT lim
        OFFSET off
      ) r
    )
  )
  INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_entry_level_jobs(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_entry_level_jobs(text, integer, integer) TO anon, authenticated;
