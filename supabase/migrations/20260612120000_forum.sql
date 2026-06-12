-- Forum: posts and comments with public read, author-scoped write.
-- Apply: `supabase db push` or paste into Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.forum_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  author_name text NOT NULL,
  author_avatar text,
  category text NOT NULL,
  subcategory text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forum_posts_title_not_blank CHECK (char_length(btrim(title)) > 0),
  CONSTRAINT forum_posts_body_not_blank CHECK (char_length(btrim(body)) > 0),
  CONSTRAINT forum_posts_title_max_length CHECK (char_length(title) <= 200),
  CONSTRAINT forum_posts_body_max_length CHECK (char_length(body) <= 20000),
  CONSTRAINT forum_posts_author_name_max_length CHECK (char_length(author_name) <= 120),
  CONSTRAINT forum_posts_category_not_blank CHECK (char_length(btrim(category)) > 0),
  CONSTRAINT forum_posts_subcategory_not_blank CHECK (char_length(btrim(subcategory)) > 0)
);

COMMENT ON TABLE public.forum_posts IS 'Community forum posts with denormalized author snapshot fields.';

CREATE INDEX IF NOT EXISTS forum_posts_created_at_idx
  ON public.forum_posts (created_at DESC);

CREATE INDEX IF NOT EXISTS forum_posts_category_subcategory_idx
  ON public.forum_posts (category, subcategory);

CREATE INDEX IF NOT EXISTS forum_posts_author_created_idx
  ON public.forum_posts (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.forum_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.forum_posts (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  author_name text NOT NULL,
  author_avatar text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forum_comments_body_not_blank CHECK (char_length(btrim(body)) > 0),
  CONSTRAINT forum_comments_body_max_length CHECK (char_length(body) <= 4000),
  CONSTRAINT forum_comments_author_name_max_length CHECK (char_length(author_name) <= 120)
);

COMMENT ON TABLE public.forum_comments IS 'Comments on forum posts; deleted when parent post is removed.';

CREATE INDEX IF NOT EXISTS forum_comments_post_created_idx
  ON public.forum_comments (post_id, created_at ASC);

CREATE INDEX IF NOT EXISTS forum_comments_author_idx
  ON public.forum_comments (author_id);

CREATE OR REPLACE FUNCTION public.forum_posts_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forum_posts_updated_at ON public.forum_posts;
CREATE TRIGGER forum_posts_updated_at
  BEFORE UPDATE ON public.forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.forum_posts_set_updated_at();

ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "forum_posts_select_public" ON public.forum_posts;
DROP POLICY IF EXISTS "forum_posts_insert_own" ON public.forum_posts;
DROP POLICY IF EXISTS "forum_posts_update_own" ON public.forum_posts;
DROP POLICY IF EXISTS "forum_posts_delete_own" ON public.forum_posts;

CREATE POLICY "forum_posts_select_public"
  ON public.forum_posts
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "forum_posts_insert_own"
  ON public.forum_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "forum_posts_update_own"
  ON public.forum_posts
  FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "forum_posts_delete_own"
  ON public.forum_posts
  FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

DROP POLICY IF EXISTS "forum_comments_select_public" ON public.forum_comments;
DROP POLICY IF EXISTS "forum_comments_insert_own" ON public.forum_comments;
DROP POLICY IF EXISTS "forum_comments_delete_own" ON public.forum_comments;

CREATE POLICY "forum_comments_select_public"
  ON public.forum_comments
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "forum_comments_insert_own"
  ON public.forum_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "forum_comments_delete_own"
  ON public.forum_comments
  FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

GRANT SELECT ON TABLE public.forum_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.forum_posts TO authenticated;

GRANT SELECT ON TABLE public.forum_comments TO anon, authenticated;
GRANT INSERT, DELETE ON TABLE public.forum_comments TO authenticated;
