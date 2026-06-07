-- Production had two get_jobs_page overloads (legacy uuid param order + new text filter).
-- PostgREST cannot pick between them when p_category_id is null.
DROP FUNCTION IF EXISTS public.get_jobs_page(text, uuid, integer, integer);
