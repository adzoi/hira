import { Link } from "react-router-dom"
import { OptimizedImage } from "./OptimizedImage.tsx"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { supabase } from "../lib/supabase.ts"
import { forumCategoryLabelKey, forumSubcategoryLabelKey } from "../lib/forumCategories.ts"
import type { ForumPostRow } from "../lib/queries/fetchForumPosts.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"

const EXCERPT_LENGTH = 160

function formatForumDate(iso: string, locale: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return "—"
  return new Date(iso).toLocaleDateString(locale === "en" ? "en-US" : "ka-GE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function getInitials(name: string): string {
  const parts = name.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "?"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim()
  if (flat.length <= EXCERPT_LENGTH) return flat
  return `${flat.slice(0, EXCERPT_LENGTH)}…`
}

type ForumPostCardProps = {
  post: ForumPostRow
  showActions?: boolean
  onEdit?: () => void
  onDelete?: () => void
}

export default function ForumPostCard({ post, showActions, onEdit, onDelete }: ForumPostCardProps) {
  const { t, locale } = useTranslation()
  const avatarSrc = post.authorAvatar ? avatarImageUrl(supabase, post.authorAvatar) ?? post.authorAvatar : null

  return (
    <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <Link to={`/forum/${post.id}`} className="flex flex-1 flex-col p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#E8F4FF] px-2.5 py-0.5 text-xs font-semibold text-[#0088FF]">
            {t(forumCategoryLabelKey(post.category))}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {t(forumSubcategoryLabelKey(post.category, post.subcategory))}
          </span>
        </div>

        <h2 className="mt-3 text-lg font-bold leading-snug text-[#1B2B4B]">{post.title}</h2>

        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">{excerpt(post.body)}</p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-bold text-[#1B2B4B]">
              {avatarSrc ? (
                <OptimizedImage
                  src={avatarSrc}
                  alt=""
                  width={32}
                  height={32}
                  className="h-full w-full object-cover"
                />
              ) : (
                getInitials(post.authorName)
              )}
            </span>
            <span className="truncate text-sm font-medium text-slate-700">{post.authorName}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
            <time dateTime={post.createdAt}>{formatForumDate(post.createdAt, locale)}</time>
            <span aria-label={t("forum.commentCount", { count: post.commentCount })}>
              {post.commentCount} {t("forum.commentsShort")}
            </span>
          </div>
        </div>
      </Link>

      {showActions ? (
        <div className="flex gap-2 border-t border-slate-100 px-4 py-3 md:px-5">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-semibold text-[#1B2B4B] transition hover:border-slate-400"
          >
            {t("forum.editPost")}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-red-200 bg-white text-sm font-semibold text-red-700 transition hover:bg-red-50"
          >
            {t("forum.deletePost")}
          </button>
        </div>
      ) : null}
    </article>
  )
}
