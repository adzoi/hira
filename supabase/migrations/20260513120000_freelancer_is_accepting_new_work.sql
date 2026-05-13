-- Freelancer "busy" flag: informational on marketplace; inquiries stay allowed.

ALTER TABLE public.freelancer_profiles
  ADD COLUMN IF NOT EXISTS is_accepting_new_work boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.freelancer_profiles.is_accepting_new_work IS
  'When false, freelancer is shown as temporarily unavailable for new work (browse/listings); hirers may still send listing inquiries.';

-- Align RPC with edge function (p_search, p_limit, p_offset) and expose flag on listings payload.

DROP FUNCTION IF EXISTS public.get_listings_page();
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
          sv.description,
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
            OR sv.description ILIKE ('%' || trim(p_search) || '%')
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
          OR sv.description ILIKE ('%' || trim(p_search) || '%')
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
      FROM (
        SELECT sk.*
        FROM skills sk
        WHERE sk.is_approved = true
        ORDER BY sk.name
        LIMIT 200
      ) sk
    )
  )
  INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_listings_page(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_listings_page(text, integer, integer) TO anon, authenticated;
