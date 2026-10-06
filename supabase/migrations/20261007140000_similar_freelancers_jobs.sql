-- "Similar freelancers" on profile pages and "Jobs like this" on job pages.
-- Scored by shared skills first, then shared category, then same city / location.

CREATE INDEX IF NOT EXISTS idx_job_skills_skill_id ON public.job_skills (skill_id);

CREATE OR REPLACE FUNCTION public.get_similar_freelancers(p_slug text, p_limit integer DEFAULT 6)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer := greatest(1, least(coalesce(nullif(p_limit, 0), 6), 12));
  v_fp_id uuid;
  v_city text;
  result json;
BEGIN
  SELECT fp.id, p.city INTO v_fp_id, v_city
  FROM freelancer_profiles fp
  JOIN profiles p ON p.id = fp.user_id
  WHERE fp.slug = trim(coalesce(p_slug, '')) AND fp.is_public = true;

  IF v_fp_id IS NULL THEN
    RETURN '[]'::json;
  END IF;

  WITH my_skills AS (
    SELECT fs.skill_id, sk.category_id
    FROM freelancer_skills fs
    JOIN skills sk ON sk.id = fs.skill_id
    WHERE fs.freelancer_profile_id = v_fp_id
  ),
  candidates AS (
    SELECT
      fs.freelancer_profile_id AS id,
      count(DISTINCT fs.skill_id) FILTER (WHERE fs.skill_id IN (SELECT skill_id FROM my_skills)) AS shared_skills,
      count(DISTINCT sk.category_id) FILTER (
        WHERE sk.category_id IN (SELECT category_id FROM my_skills WHERE category_id IS NOT NULL)
      ) AS shared_categories
    FROM freelancer_skills fs
    JOIN skills sk ON sk.id = fs.skill_id
    WHERE fs.freelancer_profile_id <> v_fp_id
      AND (
        fs.skill_id IN (SELECT skill_id FROM my_skills)
        OR sk.category_id IN (SELECT category_id FROM my_skills WHERE category_id IS NOT NULL)
      )
    GROUP BY fs.freelancer_profile_id
  )
  SELECT coalesce(json_agg(f), '[]'::json) INTO result
  FROM (
    SELECT
      fp.slug,
      p.full_name,
      p.avatar_url,
      p.city,
      fp.professional_title,
      fp.average_rating,
      fp.total_reviews_count,
      fp.completed_jobs_count,
      (
        SELECT min(sv.price)
        FROM services sv
        WHERE sv.freelancer_profile_id = fp.id AND sv.is_active = true AND sv.price > 0
      ) AS starting_price,
      (
        SELECT json_agg(x.name)
        FROM (
          SELECT sk.name
          FROM freelancer_skills fs
          JOIN skills sk ON sk.id = fs.skill_id
          WHERE fs.freelancer_profile_id = fp.id
          ORDER BY (fs.skill_id IN (SELECT skill_id FROM my_skills)) DESC, sk.name
          LIMIT 4
        ) x
      ) AS skills
    FROM candidates c
    JOIN freelancer_profiles fp ON fp.id = c.id
    JOIN profiles p ON p.id = fp.user_id
    WHERE fp.is_public = true
      AND p.is_active = true
      AND nullif(trim(fp.slug), '') IS NOT NULL
    ORDER BY
      c.shared_skills * 2 + c.shared_categories
        + CASE WHEN v_city IS NOT NULL AND p.city = v_city THEN 1.5 ELSE 0 END
        + coalesce(fp.average_rating, 0) / 5.0 DESC,
      fp.completed_jobs_count DESC,
      fp.updated_at DESC
    LIMIT lim
  ) f;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_similar_freelancers(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_similar_freelancers(text, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_similar_jobs(p_job_id uuid, p_limit integer DEFAULT 6)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer := greatest(1, least(coalesce(nullif(p_limit, 0), 6), 12));
  v_job public.jobs%ROWTYPE;
  result json;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN '[]'::json;
  END IF;

  WITH my_skills AS (
    SELECT skill_id FROM job_skills WHERE job_id = v_job.id
  ),
  scored AS (
    SELECT
      j.id,
      (SELECT count(*) FROM job_skills js WHERE js.job_id = j.id AND js.skill_id IN (SELECT skill_id FROM my_skills)) * 2
        + CASE WHEN v_job.subcategory_id IS NOT NULL AND j.subcategory_id = v_job.subcategory_id THEN 3 ELSE 0 END
        + CASE WHEN v_job.category_id IS NOT NULL AND j.category_id = v_job.category_id THEN 2 ELSE 0 END
        + CASE WHEN j.location_type = v_job.location_type THEN 0.5 ELSE 0 END AS score
    FROM jobs j
    WHERE j.id <> v_job.id
      AND j.status = 'open'
      AND (j.expires_at IS NULL OR j.expires_at > now())
      AND (j.application_deadline IS NULL OR j.application_deadline >= CURRENT_DATE)
      AND (
        j.category_id = v_job.category_id
        OR EXISTS (SELECT 1 FROM job_skills js WHERE js.job_id = j.id AND js.skill_id IN (SELECT skill_id FROM my_skills))
      )
  )
  SELECT coalesce(json_agg(r), '[]'::json) INTO result
  FROM (
    SELECT
      j.id,
      j.title,
      j.title_en,
      j.budget_type,
      j.budget_min,
      j.budget_max,
      j.location_type,
      j.created_at,
      coalesce(nullif(trim(hp.company_name), ''), p.full_name) AS company_name,
      p.avatar_url,
      p.city
    FROM scored s
    JOIN jobs j ON j.id = s.id
    JOIN hirer_profiles hp ON hp.id = j.hirer_profile_id
    JOIN profiles p ON p.id = hp.user_id
    WHERE s.score > 0
    ORDER BY s.score DESC, j.created_at DESC
    LIMIT lim
  ) r;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_similar_jobs(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_similar_jobs(uuid, integer) TO anon, authenticated;
