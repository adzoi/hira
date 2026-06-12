import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../database.types.ts"

export type ForumPostRow = {
  id: string
  authorId: string
  authorName: string
  authorAvatar: string | null
  category: string
  subcategory: string
  title: string
  body: string
  createdAt: string
  updatedAt: string
  commentCount: number
}

type RawForumPostRow = Database["public"]["Tables"]["forum_posts"]["Row"] & {
  forum_comments: Array<{ count: number }> | null
}

function mapForumPostRow(row: RawForumPostRow): ForumPostRow {
  const count = row.forum_comments?.[0]?.count ?? 0
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorAvatar: row.author_avatar,
    category: row.category,
    subcategory: row.subcategory,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    commentCount: count,
  }
}

export type FetchForumPostsOpts = {
  category?: string | null
  subcategory?: string | null
  authorId?: string | null
}

export async function fetchForumPosts(
  client: SupabaseClient<Database>,
  opts: FetchForumPostsOpts = {},
): Promise<ForumPostRow[]> {
  let query = client
    .from("forum_posts")
    .select("*, forum_comments(count)")
    .order("created_at", { ascending: false })

  if (opts.category) query = query.eq("category", opts.category)
  if (opts.subcategory) query = query.eq("subcategory", opts.subcategory)
  if (opts.authorId) query = query.eq("author_id", opts.authorId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => mapForumPostRow(row as RawForumPostRow))
}
