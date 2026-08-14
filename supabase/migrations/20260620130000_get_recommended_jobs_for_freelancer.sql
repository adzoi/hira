-- Skill-overlap job recommendations for freelancers.
-- p_freelancer_id must belong to auth.uid(); callers cannot request another user's feed.

CREATE OR REPLACE FUNCTION public.get_recommended_jobs_for_freelancer(
  p_freelancer_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer := greatest(1, least(coalesce(nullif(p_limit, 0), 20), 50));
  v_uid uuid := auth.uid();
  result json;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('jobs', '[]'::json, 'total_count', 0);
  END IF;

  IF p_freelancer_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM freelancer_profiles fp
       WHERE fp.id = p_freelancer_id
         AND fp.user_id = v_uid
     )
  THEN
    RETURN json_build_object('jobs', '[]'::json, 'total_count', 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM freelancer_skills fs
    WHERE fs.freelancer_profile_id = p_freelancer_id
  ) THEN
    RETURN json_build_object('jobs', '[]'::json, 'total_count', 0);
  END IF;

  WITH freel_skills AS (
    SELECT
      fs.skill_id,
      CASE lower(coalesce(nullif(trim(fs.level), ''), 'intermediate'))
        WHEN 'expert' THEN 3::numeric
        WHEN 'advanced' THEN 2.5::numeric
        WHEN 'senior' THEN 2.5::numeric
        WHEN 'intermediate' THEN 2::numeric
        WHEN 'beginner' THEN 1::numeric
        WHEN 'junior' THEN 1::numeric
        ELSE 1.5::numeric
      END AS weight
    FROM freelancer_skills fs
    WHERE fs.freelancer_profile_id = p_freelancer_id
  ),
  scored AS (
    SELECT
      j.id AS job_id,
      coalesce(sum(fs.weight), 0)::numeric AS overlap_score
    FROM jobs j
    JOIN job_skills js ON js.job_id = j.id
    JOIN freel_skills fs ON fs.skill_id = js.skill_id
    WHERE j.status = 'open'
      AND (j.expires_at IS NULL OR j.expires_at > now())
      AND (j.application_deadline IS NULL OR j.application_deadline >= CURRENT_DATE)
      AND NOT EXISTS (
        SELECT 1
        FROM job_applications ja
        WHERE ja.job_id = j.id
          AND ja.freelancer_profile_id = p_freelancer_id
      )
    GROUP BY j.id
    HAVING coalesce(sum(fs.weight), 0) > 0
  ),
  ranked AS (
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
        FROM job_skills js2
        JOIN skills sk ON sk.id = js2.skill_id AND sk.is_approved = true
        WHERE js2.job_id = j.id
      ) AS skills,
      s.overlap_score,
      CASE
        WHEN j.is_vip = true
          AND j.vip_expires_at IS NOT NULL
          AND j.vip_expires_at > now()
        THEN 0
        ELSE 1
      END AS vip_first
    FROM scored s
    JOIN jobs j ON j.id = s.job_id
    JOIN hirer_profiles hp ON hp.id = j.hirer_profile_id
    JOIN profiles p ON p.id = hp.user_id
    LEFT JOIN categories c ON c.id = j.category_id
    LEFT JOIN subcategories sc ON sc.id = j.subcategory_id
    ORDER BY s.overlap_score DESC, vip_first ASC, j.created_at DESC
    LIMIT lim
  )
  SELECT json_build_object(
    'jobs', COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', r.id,
            'category_id', r.category_id,
            'subcategory_id', r.subcategory_id,
            'title', r.title,
            'title_en', r.title_en,
            'description', r.description,
            'description_en', r.description_en,
            'image_urls', r.image_urls,
            'created_at', r.created_at,
            'budget_type', r.budget_type,
            'budget_min', r.budget_min,
            'budget_max', r.budget_max,
            'location_type', r.location_type,
            'duration_type', r.duration_type,
            'is_urgent', r.is_urgent,
            'application_deadline', r.application_deadline,
            'views_count', r.views_count,
            'is_vip', r.is_vip,
            'vip_expires_at', r.vip_expires_at,
            'vacancies', r.vacancies,
            'accepted_count', r.accepted_count,
            'company_name', r.company_name,
            'full_name', r.full_name,
            'avatar_url', r.avatar_url,
            'city', r.city,
            'category_name', r.category_name,
            'subcategory_name', r.subcategory_name,
            'applicants_count', r.applicants_count,
            'skills', r.skills
          )
          ORDER BY r.overlap_score DESC, r.vip_first ASC, r.created_at DESC
        )
        FROM ranked r
      ),
      '[]'::json
    ),
    'total_count', (SELECT COUNT(*)::int FROM scored)
  )
  INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_recommended_jobs_for_freelancer(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recommended_jobs_for_freelancer(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.get_recommended_jobs_for_freelancer(uuid, integer) IS
  'Returns open jobs ranked by freelancer skill overlap. p_freelancer_id must match auth.uid(). Row shape matches get_jobs_page jobs[].';
