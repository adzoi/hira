-- Public SEO landing pages: /freelancers/:category and /freelancers/:category/:city.
-- A freelancer belongs to a category through their skills (skills.category_id → mid-level
-- category); root pages include every mid-level category under them.
-- URL slugs drop the parent prefix ("technology-development-web-development" → "web-development").

CREATE OR REPLACE FUNCTION public.landing_category_short_slug(p_slug text, p_parent_slug text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_parent_slug IS NOT NULL AND left(p_slug, length(p_parent_slug) + 1) = p_parent_slug || '-'
      THEN substr(p_slug, length(p_parent_slug) + 2)
    ELSE p_slug
  END;
$$;

GRANT EXECUTE ON FUNCTION public.landing_category_short_slug(text, text) TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_skills_category_id ON public.skills (category_id);
CREATE INDEX IF NOT EXISTS idx_freelancer_skills_skill_id ON public.freelancer_skills (skill_id);

-- One landing page. Returns NULL when the category slug is unknown.
CREATE OR REPLACE FUNCTION public.get_freelancer_landing(
  p_category text,
  p_city text DEFAULT NULL,
  p_limit integer DEFAULT 24
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := lower(trim(coalesce(p_category, '')));
  v_city text := nullif(trim(p_city), '');
  lim integer := greatest(1, least(coalesce(nullif(p_limit, 0), 24), 60));
  v_cat public.categories%ROWTYPE;
  v_parent public.categories%ROWTYPE;
  v_cat_ids uuid[];
  v_related_parent uuid;
  result json;
BEGIN
  IF v_slug = '' OR v_slug = 'other' THEN
    RETURN NULL;
  END IF;

  SELECT c.* INTO v_cat
  FROM categories c
  LEFT JOIN categories pc ON pc.id = c.parent_id
  WHERE c.is_active = true
    AND (c.slug = v_slug OR public.landing_category_short_slug(c.slug, pc.slug) = v_slug)
  ORDER BY (c.slug = v_slug) DESC, c.parent_id NULLS FIRST, c.sort_order
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_cat.parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM categories WHERE id = v_cat.parent_id;
  END IF;

  WITH RECURSIVE tree AS (
    SELECT v_cat.id AS id
    UNION ALL
    SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id
  )
  SELECT array_agg(id) INTO v_cat_ids FROM tree;

  -- Root page → its children; mid page → its siblings.
  v_related_parent := coalesce(v_cat.parent_id, v_cat.id);

  WITH in_category AS (
    SELECT DISTINCT fp.id, p.city
    FROM freelancer_profiles fp
    JOIN profiles p ON p.id = fp.user_id
    JOIN freelancer_skills fs ON fs.freelancer_profile_id = fp.id
    JOIN skills sk ON sk.id = fs.skill_id
    WHERE fp.is_public = true
      AND p.is_active = true
      AND nullif(trim(fp.slug), '') IS NOT NULL
      AND sk.category_id = ANY (v_cat_ids)
  ),
  matched AS (
    SELECT id FROM in_category WHERE v_city IS NULL OR city = v_city
  )
  SELECT json_build_object(
    'category', json_build_object(
      'id', v_cat.id,
      'slug', public.landing_category_short_slug(v_cat.slug, v_parent.slug),
      'name_ka', v_cat.name_ka,
      'name_en', v_cat.name_en
    ),
    'parent', CASE WHEN v_parent.id IS NULL THEN NULL ELSE json_build_object(
      'slug', v_parent.slug,
      'name_ka', v_parent.name_ka,
      'name_en', v_parent.name_en
    ) END,
    'city', v_city,
    'total_count', (SELECT count(*)::int FROM matched),
    'freelancers', (
      SELECT coalesce(json_agg(f), '[]'::json)
      FROM (
        SELECT
          fp.slug,
          p.full_name,
          p.avatar_url,
          p.city,
          p.is_verified,
          fp.professional_title,
          fp.average_rating,
          fp.total_reviews_count,
          fp.completed_jobs_count,
          fp.is_accepting_new_work,
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
              ORDER BY (sk.category_id = ANY (v_cat_ids)) DESC, sk.name
              LIMIT 4
            ) x
          ) AS skills
        FROM matched m
        JOIN freelancer_profiles fp ON fp.id = m.id
        JOIN profiles p ON p.id = fp.user_id
        ORDER BY
          coalesce(fp.average_rating, 0) * ln(2 + coalesce(fp.total_reviews_count, 0)) DESC,
          coalesce(fp.completed_jobs_count, 0) DESC,
          (p.avatar_url IS NOT NULL) DESC,
          fp.updated_at DESC
        LIMIT lim
      ) f
    ),
    'cities', (
      SELECT coalesce(json_agg(json_build_object('city', c.city, 'count', c.n) ORDER BY c.n DESC, c.city), '[]'::json)
      FROM (
        SELECT city, count(*)::int AS n
        FROM in_category
        WHERE nullif(trim(city), '') IS NOT NULL AND city NOT LIKE '\_\_%'
        GROUP BY city
      ) c
    ),
    'related', (
      SELECT coalesce(json_agg(r ORDER BY r.count DESC, r.name_ka), '[]'::json)
      FROM (
        SELECT
          public.landing_category_short_slug(rc.slug, rp.slug) AS slug,
          rc.name_ka,
          rc.name_en,
          (
            SELECT count(DISTINCT fp.id)::int
            FROM freelancer_profiles fp
            JOIN profiles p ON p.id = fp.user_id
            JOIN freelancer_skills fs ON fs.freelancer_profile_id = fp.id
            JOIN skills sk ON sk.id = fs.skill_id
            WHERE sk.category_id = rc.id
              AND fp.is_public = true
              AND p.is_active = true
              AND (v_city IS NULL OR p.city = v_city)
          ) AS count
        FROM categories rc
        LEFT JOIN categories rp ON rp.id = rc.parent_id
        WHERE rc.is_active = true
          AND rc.parent_id = v_related_parent
          AND rc.id <> v_cat.id
      ) r
      WHERE r.count > 0
    ),
    'jobs', (
      SELECT coalesce(json_agg(j), '[]'::json)
      FROM (
        SELECT j.id, j.title, j.title_en, j.budget_type, j.budget_min, j.budget_max, j.location_type, j.created_at
        FROM jobs j
        WHERE j.status = 'open'
          AND (j.expires_at IS NULL OR j.expires_at > now())
          AND j.category_id = ANY (v_cat_ids)
        ORDER BY j.created_at DESC
        LIMIT 6
      ) j
    )
  )
  INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_freelancer_landing(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_freelancer_landing(text, text, integer) TO anon, authenticated, service_role;

-- Every category (and category × city) that has at least one public freelancer.
-- Feeds the /freelancers hub and the sitemap.
CREATE OR REPLACE FUNCTION public.get_freelancer_landing_index()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH fc AS (
    SELECT DISTINCT fp.id AS fid, p.city, sk.category_id AS cid
    FROM freelancer_profiles fp
    JOIN profiles p ON p.id = fp.user_id
    JOIN freelancer_skills fs ON fs.freelancer_profile_id = fp.id
    JOIN skills sk ON sk.id = fs.skill_id
    WHERE fp.is_public = true
      AND p.is_active = true
      AND nullif(trim(fp.slug), '') IS NOT NULL
      AND sk.category_id IS NOT NULL
  ),
  -- Roll each mid-level match up to its root so root pages count everyone underneath.
  rolled AS (
    SELECT fid, city, cid FROM fc
    UNION
    SELECT fc.fid, fc.city, c.parent_id FROM fc JOIN categories c ON c.id = fc.cid WHERE c.parent_id IS NOT NULL
  ),
  cats AS (
    SELECT c.id, c.slug, c.name_ka, c.name_en, c.parent_id, c.sort_order,
           public.landing_category_short_slug(c.slug, pc.slug) AS short_slug
    FROM categories c
    LEFT JOIN categories pc ON pc.id = c.parent_id
    WHERE c.is_active = true AND c.slug <> 'other'
  )
  SELECT json_build_object(
    'categories', (
      SELECT coalesce(json_agg(x ORDER BY x.sort_order), '[]'::json)
      FROM (
        SELECT cats.short_slug AS slug, cats.name_ka, cats.name_en, cats.sort_order,
               (SELECT pc.slug FROM categories pc WHERE pc.id = cats.parent_id) AS parent_slug,
               count(DISTINCT r.fid)::int AS count
        FROM cats
        JOIN rolled r ON r.cid = cats.id
        GROUP BY cats.id, cats.short_slug, cats.name_ka, cats.name_en, cats.sort_order, cats.parent_id
      ) x
    ),
    'combos', (
      SELECT coalesce(json_agg(y), '[]'::json)
      FROM (
        SELECT cats.short_slug AS slug, r.city, count(DISTINCT r.fid)::int AS count
        FROM cats
        JOIN rolled r ON r.cid = cats.id
        WHERE nullif(trim(r.city), '') IS NOT NULL AND r.city NOT LIKE '\_\_%'
        GROUP BY cats.short_slug, r.city
      ) y
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_freelancer_landing_index() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_freelancer_landing_index() TO anon, authenticated, service_role;
