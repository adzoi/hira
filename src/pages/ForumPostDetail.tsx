import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { OptimizedImage } from "../components/OptimizedImage.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import { useToast } from "../components/ui/ToastProvider.tsx"
import { forumCategoryLabelKey, forumSubcategoryLabelKey } from "../lib/forumCategories.ts"
import { fetchForumPostDetail } from "../lib/queries/fetchForumPostDetail.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase.ts"
import { getAuthenticatedSession } from "../lib/supabaseAuth.ts"
import { validateTextField, LIMITS } from "../lib/validation.ts"
import { usePageMeta } from "../lib/usePageMeta.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { assertContentRateLimit, formatContentRateLimitError } from "../lib/contentRateLimit.ts"

function formatForumDateTime(iso: string, locale: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return "-"
  return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "ka-GE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getInitials(name: string): string {
  const parts = name.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "?"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

export default function ForumPostDetailPage() {
  const { postId } = useParams<{ postId: string }>()
  const navigate = useNavigate()
  const { t, locale } = useTranslation()
  const { pushToast } = useToast()
  const queryClient = useQueryClient()

  const [userId, setUserId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [commentText, setCommentText] = useState("")
  const [commentError, setCommentError] = useState<string | null>(null)
  const [submittingComment, setSubmittingComment] = useState(false)

  useEffect(() => {
    const client = supabase
    if (!client) {
      setAuthChecked(true)
      return
    }
    void getAuthenticatedSession(client).then(({ user }) => {
      setUserId(user?.id ?? null)
      setAuthChecked(true)
    })
  }, [])

  const { data: post, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.forumPostDetail(postId ?? ""),
    queryFn: async () => {
      const client = supabase
      if (!client || !postId || !isSupabaseConfigured) return null
      return fetchForumPostDetail(client, postId)
    },
    enabled: Boolean(postId),
  })

  const isAuthor = Boolean(userId && post && post.authorId === userId)
  const isAuthed = Boolean(userId)

  const pageMeta = usePageMeta(
    post ? `${post.title} - ${t("forum.heading")}` : t("forum.pageTitle"),
    post ? post.body.slice(0, 160) : t("forum.metaDescription"),
  )

  const handleDeletePost = async () => {
    if (!post || !window.confirm(t("forum.deletePostConfirm"))) return
    const client = supabase
    if (!client) return
    const { error: deleteError } = await client.from("forum_posts").delete().eq("id", post.id)
    if (deleteError) {
      pushToast({ type: "error", message: t("forum.deletePostError") })
      return
    }
    pushToast({ type: "success", message: t("forum.deletePostSuccess") })
    void queryClient.invalidateQueries({ queryKey: ["forum-posts"] })
    navigate("/forum")
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    setCommentError(null)
    const client = supabase
    if (!client || !post || !userId) {
      navigate("/login?reason=forum-comment")
      return
    }

    const validated = validateTextField(commentText, {
      label: t("forum.commentLabel"),
      min: LIMITS.forumCommentMin,
      max: LIMITS.forumComment,
    })
    if (!validated.ok) {
      setCommentError(validated.message)
      return
    }

    setSubmittingComment(true)
    try {
      await assertContentRateLimit("forum-comment")

      const { data: profile } = await client
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", userId)
        .maybeSingle()

      const { error: insertError } = await client.from("forum_comments").insert({
        post_id: post.id,
        author_id: userId,
        author_name: profile?.full_name?.trim() || t("nav.user"),
        author_avatar: profile?.avatar_url ?? null,
        body: validated.value,
      })

      if (insertError) throw insertError

      setCommentText("")
      pushToast({ type: "success", message: t("forum.commentSuccess") })
      void queryClient.invalidateQueries({ queryKey: queryKeys.forumPostDetail(post.id) })
      void queryClient.invalidateQueries({ queryKey: ["forum-posts"] })
    } catch (commentSubmitError) {
      const rateMsg = formatContentRateLimitError(commentSubmitError, t)
      pushToast({ type: "error", message: rateMsg ?? t("forum.commentError") })
    } finally {
      setSubmittingComment(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm(t("forum.deleteCommentConfirm"))) return
    const client = supabase
    if (!client) return
    const { error: deleteError } = await client.from("forum_comments").delete().eq("id", commentId)
    if (deleteError) {
      pushToast({ type: "error", message: t("forum.deleteCommentError") })
      return
    }
    pushToast({ type: "success", message: t("forum.deleteCommentSuccess") })
    void queryClient.invalidateQueries({ queryKey: queryKeys.forumPostDetail(postId ?? "") })
    void queryClient.invalidateQueries({ queryKey: ["forum-posts"] })
  }

  const authorAvatarSrc = useMemo(() => {
    if (!post?.authorAvatar) return null
    return avatarImageUrl(supabase, post.authorAvatar) ?? post.authorAvatar
  }, [post?.authorAvatar])

  if (isLoading || !authChecked) {
    return (
      <main className="min-h-[60vh] px-4 pb-16 pt-6 md:pl-12 lg:pl-16">
        {pageMeta}
        <div className="mx-auto max-w-[800px]">
          <SkeletonCard lines={6} />
        </div>
      </main>
    )
  }

  if (isError) {
    return (
      <main className="min-h-[60vh] px-4 pb-16 pt-6 md:pl-12 lg:pl-16">
        {pageMeta}
        <div className="mx-auto max-w-[800px]">
          <ErrorState message={queryErrorMessage(error, t("forum.loadError"))} onRetry={() => void refetch()} />
        </div>
      </main>
    )
  }

  if (!post) {
    return (
      <main className="min-h-[60vh] px-4 pb-16 pt-6 md:pl-12 lg:pl-16">
        {pageMeta}
        <div className="mx-auto max-w-[800px] rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-lg font-semibold text-[#1B2B4B]">{t("forum.postNotFound")}</p>
          <Link to="/forum" className="mt-4 inline-flex h-11 items-center rounded-lg bg-[#1B2B4B] px-5 text-sm font-semibold text-white hover:bg-[#D4A843]">
            {t("forum.backToForum")}
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[60vh] px-4 pb-16 pt-6 md:pl-12 lg:pl-16">
      {pageMeta}

      <div className="mx-auto max-w-[800px]">
        <Link to="/forum" className="text-sm font-medium text-[#0088FF] hover:underline">
          ← {t("forum.backToForum")}
        </Link>

        <article className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#E8F4FF] px-2.5 py-0.5 text-xs font-semibold text-[#0088FF]">
              {t(forumCategoryLabelKey(post.category))}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {t(forumSubcategoryLabelKey(post.category, post.subcategory))}
            </span>
          </div>

          <h1 className="mt-4 text-2xl font-extrabold text-[#1B2B4B] md:text-3xl">{post.title}</h1>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-bold text-[#1B2B4B]">
              {authorAvatarSrc ? (
                <OptimizedImage src={authorAvatarSrc} alt="" width={40} height={40} className="h-full w-full object-cover" />
              ) : (
                getInitials(post.authorName)
              )}
            </span>
            <div>
              <p className="text-sm font-semibold text-[#1B2B4B]">{post.authorName}</p>
              <time className="text-xs text-slate-500" dateTime={post.createdAt}>
                {formatForumDateTime(post.createdAt, locale)}
              </time>
            </div>
          </div>

          <div className="mt-6 whitespace-pre-wrap text-base leading-relaxed text-slate-700">{post.body}</div>

          {isAuthor ? (
            <div className="mt-8 flex flex-wrap gap-3 border-t border-slate-100 pt-6">
              <Link
                to={`/forum/${post.id}/edit`}
                className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-[#1B2B4B] transition hover:border-slate-400"
              >
                {t("forum.editPost")}
              </Link>
              <button
                type="button"
                onClick={() => void handleDeletePost()}
                className="inline-flex h-11 items-center rounded-lg border border-red-200 bg-white px-5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
              >
                {t("forum.deletePost")}
              </button>
            </div>
          ) : null}
        </article>

        <section className="mt-8">
          <h2 className="text-lg font-bold text-[#1B2B4B]">
            {t("forum.commentsHeading")} ({post.comments.length})
          </h2>

          {post.comments.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t("forum.noComments")}</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {post.comments.map((comment) => {
                const commentAvatarSrc = comment.authorAvatar
                  ? avatarImageUrl(supabase, comment.authorAvatar) ?? comment.authorAvatar
                  : null
                const isCommentAuthor = userId === comment.authorId
                return (
                  <li key={comment.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-bold text-[#1B2B4B]">
                          {commentAvatarSrc ? (
                            <OptimizedImage src={commentAvatarSrc} alt="" width={36} height={36} className="h-full w-full object-cover" />
                          ) : (
                            getInitials(comment.authorName)
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#1B2B4B]">{comment.authorName}</p>
                          <time className="text-xs text-slate-500" dateTime={comment.createdAt}>
                            {formatForumDateTime(comment.createdAt, locale)}
                          </time>
                        </div>
                      </div>
                      {isCommentAuthor ? (
                        <button
                          type="button"
                          onClick={() => void handleDeleteComment(comment.id)}
                          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          {t("forum.deleteComment")}
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{comment.body}</p>
                  </li>
                )
              })}
            </ul>
          )}

          {isAuthed ? (
            <form onSubmit={(e) => void handleSubmitComment(e)} className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <label htmlFor="forum-comment" className="block text-sm font-semibold text-[#1B2B4B]">
                {t("forum.addComment")}
              </label>
              <textarea
                id="forum-comment"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={4}
                className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-[#1B2B4B] outline-none focus:border-[#0088FF] focus:ring-1 focus:ring-[#0088FF]"
                placeholder={t("forum.commentPlaceholder")}
              />
              {commentError ? <p className="mt-1 text-sm text-red-600">{commentError}</p> : null}
              <button
                type="submit"
                disabled={submittingComment}
                className="mt-3 inline-flex h-11 items-center rounded-lg bg-[#0088FF] px-5 text-sm font-semibold text-white transition hover:bg-[#006ACC] disabled:opacity-60"
              >
                {submittingComment ? t("forum.submitting") : t("forum.submitComment")}
              </button>
            </form>
          ) : (
            <p className="mt-6 text-sm text-slate-600">
              <Link to="/login?reason=forum-comment" className="font-semibold text-[#0088FF] hover:underline">
                {t("nav.login")}
              </Link>{" "}
              {t("forum.loginToComment")}
            </p>
          )}
        </section>
      </div>
    </main>
  )
}
