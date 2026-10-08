-- Latin ↔ Georgian search: "dizaini" finds "დიზაინი", "logos gaketeba" finds "ლოგოს გაკეთება".
-- Query and text are folded into one Latin key; letters informal transliteration
-- doesn't distinguish are merged (თ/ტ, კ/ქ/ყ, პ/ფ, ც/წ, ჩ/ჭ, ჯ/ჟ).
-- Keep in sync with src/lib/searchTranslit.ts.

CREATE OR REPLACE FUNCTION public.ka_search_key(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path TO pg_catalog
AS $$
  SELECT trim(regexp_replace(
    replace(replace(replace(replace(replace(replace(replace(replace(
      translate(
        regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
          lower(coalesce(p_text, '')),
          '[''’`ʼ]', '', 'g'),
          'tch', 'ch', 'g'),
          'ph', 'p', 'g'),
          'th', 't', 'g'),
          'zh', 'j', 'g'),
          'c(?!h)', 'ts', 'g'),
          'x', 'kh', 'g'),
          '[qy]', 'k', 'g'),
          'w', 'ts', 'g'),
          'f', 'p', 'g'),
        'აბგდევზთიკლმნოპჟრსტუფქყჯჰ',
        'abgdevztiklmnopjrstupkkjh'),
      'ღ', 'gh'), 'შ', 'sh'), 'ჩ', 'ch'), 'ც', 'ts'),
      'ძ', 'dz'), 'წ', 'ts'), 'ჭ', 'ch'), 'ხ', 'kh'),
    '[^[:alnum:]]+', ' ', 'g'));
$$;

REVOKE ALL ON FUNCTION public.ka_search_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ka_search_key(text) TO anon, authenticated, service_role;

-- Folded title + description, indexed for '%key%' lookups.
CREATE INDEX IF NOT EXISTS jobs_ka_search_key_trgm_idx
  ON public.jobs USING gin (
    public.ka_search_key(coalesce(title, '') || ' ' || coalesce(description, '')) extensions.gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS services_ka_search_key_trgm_idx
  ON public.services USING gin (
    public.ka_search_key(coalesce(title, '') || ' ' || coalesce(description, '')) extensions.gin_trgm_ops
  );

CREATE OR REPLACE FUNCTION public.get_jobs_page(
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_category_id text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  lim integer := greatest(1, least(coalesce(nullif(p_limit, 0), 20), 100));
  off integer := greatest(0, coalesce(p_offset, 0));
  cat text := nullif(trim(p_category_id), '');
  search_trim text := nullif(trim(p_search), '');
  search_key text := NULL;
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
    search_key := nullif(public.ka_search_key(search_trim), '');
    IF length(search_key) < 3 THEN
      search_key := NULL;
    END IF;
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
            OR (
              search_key IS NOT NULL
              AND public.ka_search_key(coalesce(j.title, '') || ' ' || coalesce(j.description, ''))
                LIKE '%' || search_key || '%'
            )
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
          OR (
            search_key IS NOT NULL
            AND public.ka_search_key(coalesce(j.title, '') || ' ' || coalesce(j.description, ''))
              LIKE '%' || search_key || '%'
          )
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
$function$;

CREATE OR REPLACE FUNCTION public.get_listings_page(
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  lim integer := greatest(1, least(coalesce(nullif(p_limit, 0), 20), 100));
  off integer := greatest(0, coalesce(p_offset, 0));
  search_trim text := nullif(trim(p_search), '');
  search_key text := NULL;
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
    search_key := nullif(public.ka_search_key(search_trim), '');
    IF length(search_key) < 3 THEN
      search_key := NULL;
    END IF;
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
            OR (
              search_key IS NOT NULL
              AND (
                public.ka_search_key(coalesce(sv.title, '') || ' ' || coalesce(sv.description, ''))
                  LIKE '%' || search_key || '%'
                OR public.ka_search_key(p.full_name) LIKE '%' || search_key || '%'
              )
            )
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
          OR (
            search_key IS NOT NULL
            AND (
              public.ka_search_key(coalesce(sv.title, '') || ' ' || coalesce(sv.description, ''))
                LIKE '%' || search_key || '%'
              OR public.ka_search_key(p.full_name) LIKE '%' || search_key || '%'
            )
          )
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
$function$;
