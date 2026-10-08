-- get_jobs_page / get_listings_page bump catalog_search_path_daily (an INSERT) whenever a search
-- term is given. They were declared STABLE, so PostgREST ran them in a read-only transaction and
-- every search failed with "cannot execute INSERT in a read-only transaction". Mark them VOLATILE.

ALTER FUNCTION public.get_jobs_page(text, integer, integer, text) VOLATILE;
ALTER FUNCTION public.get_listings_page(text, integer, integer) VOLATILE;
