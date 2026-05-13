-- Bookmarks: freelancers, hirers, jobs, services (listings). One row per user + type + target id.
-- Apply: `supabase db push` or paste into Supabase SQL Editor.
--
-- PostgREST: RLS filters rows; GRANT lets authenticated clients use these operations at all.

CREATE TABLE IF NOT EXISTS public.user_saved_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (
    resource_type = ANY (ARRAY['freelancer'::text, 'hirer'::text, 'job'::text, 'service'::text])
  ),
  resource_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_saved_items_unique_target UNIQUE (user_id, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS user_saved_items_user_created_idx
  ON public.user_saved_items (user_id, created_at DESC);

COMMENT ON TABLE public.user_saved_items IS
  'Per-user bookmarks: resource_id is freelancer_profiles.id, hirer_profiles.id, jobs.id, or services.id depending on resource_type.';

ALTER TABLE public.user_saved_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_saved_items_select_own" ON public.user_saved_items;
DROP POLICY IF EXISTS "user_saved_items_insert_own" ON public.user_saved_items;
DROP POLICY IF EXISTS "user_saved_items_delete_own" ON public.user_saved_items;

CREATE POLICY "user_saved_items_select_own"
  ON public.user_saved_items
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_saved_items_insert_own"
  ON public.user_saved_items
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_saved_items_delete_own"
  ON public.user_saved_items
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON TABLE public.user_saved_items TO authenticated;
