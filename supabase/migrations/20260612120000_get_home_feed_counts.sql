-- Include homepage stats counts in get_home_feed so the client makes one Edge call.

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
            'description', sv.description,
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
    ),
    'counts', json_build_object(
      'freelancers', (
        SELECT count(*)::int
        FROM freelancer_profiles
        WHERE is_public = true
      ),
      'jobs', (
        SELECT count(*)::int
        FROM jobs
      ),
      'completedJobs', (
        SELECT count(*)::int
        FROM completed_jobs
      )
    )
  )
  INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_home_feed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_home_feed() TO anon, authenticated;
