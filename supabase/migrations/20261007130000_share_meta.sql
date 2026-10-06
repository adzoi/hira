-- Public fields used to build link previews (Open Graph tags + generated share images)
-- for freelancer profiles, jobs and listings. Returns NULL for anything not publicly visible.

CREATE OR REPLACE FUNCTION public.get_share_meta(p_kind text, p_id text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text := trim(coalesce(p_id, ''));
  result json;
BEGIN
  IF v_id = '' OR length(v_id) > 200 THEN
    RETURN NULL;
  END IF;

  IF p_kind = 'freelancer' THEN
    SELECT json_build_object(
      'kind', 'freelancer',
      'slug', fp.slug,
      'name', p.full_name,
      'title', fp.professional_title,
      'bio', left(coalesce(fp.bio, ''), 300),
      'city', p.city,
      'avatar_url', p.avatar_url,
      'rating', fp.average_rating,
      'reviews', fp.total_reviews_count,
      'completed', fp.completed_jobs_count,
      'skills', (
        SELECT json_agg(x.name)
        FROM (
          SELECT sk.name
          FROM freelancer_skills fs
          JOIN skills sk ON sk.id = fs.skill_id
          WHERE fs.freelancer_profile_id = fp.id
          ORDER BY sk.name
          LIMIT 5
        ) x
      )
    )
    INTO result
    FROM freelancer_profiles fp
    JOIN profiles p ON p.id = fp.user_id
    WHERE fp.slug = v_id AND fp.is_public = true AND p.is_active = true;

  ELSIF p_kind = 'job' THEN
    IF v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN NULL;
    END IF;
    SELECT json_build_object(
      'kind', 'job',
      'id', j.id,
      'title', j.title,
      'description', left(coalesce(j.description, ''), 300),
      'budget_type', j.budget_type,
      'budget_min', j.budget_min,
      'budget_max', j.budget_max,
      'location_type', j.location_type,
      'status', j.status,
      'company', coalesce(nullif(trim(hp.company_name), ''), p.full_name),
      'city', p.city,
      'is_beginner_friendly', coalesce((to_jsonb(j) ->> 'is_beginner_friendly')::boolean, false),
      'is_internship', coalesce((to_jsonb(j) ->> 'is_internship')::boolean, false)
    )
    INTO result
    FROM jobs j
    JOIN hirer_profiles hp ON hp.id = j.hirer_profile_id
    JOIN profiles p ON p.id = hp.user_id
    -- Mirrors the jobs_select RLS policy for anonymous visitors.
    WHERE j.id = v_id::uuid AND j.status = 'open';

  ELSIF p_kind = 'listing' THEN
    IF v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN NULL;
    END IF;
    SELECT json_build_object(
      'kind', 'listing',
      'id', sv.id,
      'title', sv.title,
      'description', left(coalesce(sv.description, ''), 300),
      'price', sv.price,
      'price_type', sv.price_type,
      'name', p.full_name,
      'city', p.city,
      'avatar_url', p.avatar_url,
      'rating', fp.average_rating,
      'reviews', fp.total_reviews_count
    )
    INTO result
    FROM services sv
    JOIN freelancer_profiles fp ON fp.id = sv.freelancer_profile_id
    JOIN profiles p ON p.id = fp.user_id
    WHERE sv.id = v_id::uuid AND sv.is_active = true AND fp.is_public = true;
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_share_meta(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_share_meta(text, text) TO anon, authenticated, service_role;
