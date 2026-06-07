-- Bilingual service listings: optional English title and description alongside Georgian.

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS description_en text;

COMMENT ON COLUMN public.services.title_en IS 'Optional English listing title; shown when viewer locale is English.';
COMMENT ON COLUMN public.services.description_en IS 'Optional English listing description (plain text, no meta block).';

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_title_en_max_length,
  ADD CONSTRAINT services_title_en_max_length CHECK (title_en IS NULL OR char_length(title_en) <= 120);

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_description_en_max_length,
  ADD CONSTRAINT services_description_en_max_length CHECK (description_en IS NULL OR char_length(description_en) <= 20000);

-- Listings catalog: return English fields and search them too.
DROP FUNCTION IF EXISTS public.get_listings_page(text, integer, integer);

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
  result json;
BEGIN
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
            p_search IS NULL
            OR length(trim(p_search)) = 0
            OR sv.title ILIKE ('%' || trim(p_search) || '%')
            OR sv.title_en ILIKE ('%' || trim(p_search) || '%')
            OR sv.description ILIKE ('%' || trim(p_search) || '%')
            OR sv.description_en ILIKE ('%' || trim(p_search) || '%')
            OR p.full_name ILIKE ('%' || trim(p_search) || '%')
          )
        ORDER BY sv.created_at DESC
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
          p_search IS NULL
          OR length(trim(p_search)) = 0
          OR sv.title ILIKE ('%' || trim(p_search) || '%')
          OR sv.title_en ILIKE ('%' || trim(p_search) || '%')
          OR sv.description ILIKE ('%' || trim(p_search) || '%')
          OR sv.description_en ILIKE ('%' || trim(p_search) || '%')
          OR p.full_name ILIKE ('%' || trim(p_search) || '%')
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

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_listings_page(text, integer, integer) TO anon, authenticated;

-- Home feed: add English listing fields to services payload (jobs section unchanged).
DROP FUNCTION IF EXISTS public.get_home_feed();

CREATE OR REPLACE FUNCTION public.get_home_feed()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'services', (
      SELECT COALESCE(json_agg(row_json ORDER BY vip_first, created_at DESC), '[]'::json)
      FROM (
        SELECT
          json_build_object(
            'id', sv.id,
            'created_at', sv.created_at,
            'title', sv.title,
            'title_en', sv.title_en,
            'description', sv.description,
            'description_en', sv.description_en,
            'price', sv.price,
            'delivery_days', sv.delivery_days,
            'views_count', sv.views_count,
            'is_public', fp.is_public,
            'slug', fp.slug,
            'professional_title', fp.professional_title,
            'average_rating', fp.average_rating,
            'full_name', p.full_name,
            'avatar_url', p.avatar_url,
            'is_vip', sv.is_vip,
            'vip_expires_at', sv.vip_expires_at,
            'skill_names', COALESCE(
              (
                SELECT json_agg(sk.name ORDER BY sk.name)
                FROM freelancer_skills fs
                JOIN skills sk ON sk.id = fs.skill_id AND sk.is_approved = true
                WHERE fs.freelancer_profile_id = fp.id
              ),
              '[]'::json
            )
          ) AS row_json,
          CASE
            WHEN sv.is_vip = true
              AND sv.vip_expires_at IS NOT NULL
              AND sv.vip_expires_at > now()
            THEN 0
            ELSE 1
          END AS vip_first,
          sv.created_at
        FROM services sv
        JOIN freelancer_profiles fp ON fp.id = sv.freelancer_profile_id
        JOIN profiles p ON p.id = fp.user_id
        WHERE sv.is_active = true
          AND fp.is_public = true
        ORDER BY vip_first, sv.created_at DESC
        LIMIT 80
      ) svc
    ),
    'jobs', (
      SELECT COALESCE(json_agg(row_json ORDER BY vip_first, created_at DESC), '[]'::json)
      FROM (
        SELECT
          json_build_object(
            'id', j.id,
            'created_at', j.created_at,
            'title', j.title,
            'description', j.description,
            'image_urls', COALESCE(j.image_urls, ARRAY[]::text[]),
            'budget_type', j.budget_type,
            'budget_min', j.budget_min,
            'budget_max', j.budget_max,
            'location_type', j.location_type,
            'duration_type', j.duration_type,
            'is_urgent', j.is_urgent,
            'application_deadline', j.application_deadline,
            'views_count', j.views_count,
            'is_vip', j.is_vip,
            'vip_expires_at', j.vip_expires_at,
            'vacancies', j.vacancies,
            'accepted_count', j.accepted_count,
            'company_name', hp.company_name,
            'full_name', p.full_name,
            'avatar_url', p.avatar_url,
            'city', p.city,
            'category_name', COALESCE(NULLIF(trim(c.name_ka), ''), NULLIF(trim(c.name_en), ''), 'კატეგორია'),
            'subcategory_name', CASE
              WHEN sc.id IS NULL THEN NULL
              ELSE COALESCE(NULLIF(trim(sc.name_ka), ''), NULLIF(trim(sc.name_en), ''), NULL)
            END,
            'applicants_count', COALESCE(
              (
                SELECT count(*)::int
                FROM job_applications ja
                WHERE ja.job_id = j.id
              ),
              0
            ),
            'skill_names', COALESCE(
              (
                SELECT json_agg(sk.name ORDER BY sk.name)
                FROM job_skills js
                JOIN skills sk ON sk.id = js.skill_id AND sk.is_approved = true
                WHERE js.job_id = j.id
              ),
              '[]'::json
            ),
            'hirer_average_rating', COALESCE(
              (
                SELECT avg(r.rating_overall)::numeric
                FROM reviews r
                WHERE r.reviewee_id = hp.user_id
                  AND r.rating_overall IS NOT NULL
                  AND r.rating_overall > 0
              ),
              NULLIF(hp.average_rating_given, 0)::numeric
            ),
            'average_rating_given', hp.average_rating_given
          ) AS row_json,
          CASE
            WHEN j.is_vip = true
              AND j.vip_expires_at IS NOT NULL
              AND j.vip_expires_at > now()
            THEN 0
            ELSE 1
          END AS vip_first,
          j.created_at
        FROM jobs j
        JOIN hirer_profiles hp ON hp.id = j.hirer_profile_id
        JOIN profiles p ON p.id = hp.user_id
        LEFT JOIN categories c ON c.id = j.category_id
        LEFT JOIN subcategories sc ON sc.id = j.subcategory_id
        WHERE j.status = 'open'
          AND (j.expires_at IS NULL OR j.expires_at > now())
        ORDER BY vip_first, j.created_at DESC
        LIMIT 80
      ) jb
    )
  )
  INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_home_feed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_home_feed() TO anon, authenticated;
