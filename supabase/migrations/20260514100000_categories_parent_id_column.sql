-- App and PostgREST expect categories.parent_id (3-level taxonomy).
-- Idempotent: safe if 20260513230000_categories_parent_technology_tree.sql already ran.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories (parent_id);

COMMENT ON COLUMN public.categories.parent_id IS
  'Optional parent category. Null = top-level. Mid-level rows point at the umbrella category.';
