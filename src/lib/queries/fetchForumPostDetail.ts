import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../database.types.ts"
import type { ForumPostRow } from "./fetchForumPosts.ts"

export type ForumCommentRow = {
  id: string
  postId: string
  authorId: string
  authorName: string
  authorAvatar: string | null
  body: string
  createdAt: string
}

export type ForumPostDetail = ForumPostRow & {
  comments: ForumCommentRow[]
}

type RawForumPostRow = Database["public"]["Tables"]["forum_posts"]["Row"] & {
  forum_comments: Array<{ count: number }> | null
}

type RawForumCommentRow = Database["public"]["Tables"]["forum_comments"]["Row"]

function mapCommentRow(row: RawForumCommentRow): ForumCommentRow {
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorAvatar: row.author_avatar,
    body: row.body,
    createdAt: row.created_at,
  }
}

export async function fetchForumPostDetail(
  client: SupabaseClient<Database>,
  postId: string,
): Promise<ForumPostDetail | null> {
  const { data: postData, error: postError } = await client
    .from("forum_posts")
    .select("*, forum_comments(count)")
    .eq("id", postId)
    .maybeSingle()

  if (postError) throw postError
  if (!postData) return null

  const row = postData as RawForumPostRow
  const commentCount = row.forum_comments?.[0]?.count ?? 0

  const { data: commentsData, error: commentsError } = await client
    .from("forum_comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })

  if (commentsError) throw commentsError

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
    commentCount,
    comments: (commentsData ?? []).map((c) => mapCommentRow(c as RawForumCommentRow)),
  }
}
