import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import { useToast } from "../components/ui/ToastProvider.tsx"
import {
  FORUM_CATEGORIES,
  forumCategoryLabelKey,
  forumSubcategoryLabelKey,
  isValidForumCategoryPair,
  subcategoriesForCategory,
} from "../lib/forumCategories.ts"
import { fetchForumPostDetail } from "../lib/queries/fetchForumPostDetail.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase.ts"
import { getAuthenticatedSession } from "../lib/supabaseAuth.ts"
import { validateTextField, LIMITS } from "../lib/validation.ts"
import { usePageMeta } from "../lib/usePageMeta.tsx"
import { assertContentRateLimit, formatContentRateLimitError } from "../lib/contentRateLimit.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"

const fieldClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-[#1B2B4B] outline-none focus:border-[#0088FF] focus:ring-1 focus:ring-[#0088FF]"

export default function ForumPostFormPage() {
  const { postId } = useParams<{ postId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { pushToast } = useToast()
  const queryClient = useQueryClient()

  const isEdit = Boolean(postId)
  const [userId, setUserId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [category, setCategory] = useState(FORUM_CATEGORIES[0]?.id ?? "")
  const [subcategory, setSubcategory] = useState(FORUM_CATEGORIES[0]?.subcategories[0]?.id ?? "")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const client = supabase
    if (!client) {
      setAuthChecked(true)
      navigate("/login?reason=forum-post")
      return
    }
    void getAuthenticatedSession(client).then(({ user }) => {
      if (!user) {
        navigate("/login?reason=forum-post")
        return
      }
      setUserId(user.id)
      setAuthChecked(true)
    })
  }, [navigate])

  const { data: existingPost, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.forumPostDetail(postId ?? ""),
    queryFn: async () => {
      const client = supabase
      if (!client || !postId || !isSupabaseConfigured) return null
      return fetchForumPostDetail(client, postId)
    },
    enabled: isEdit && Boolean(postId),
  })

  useEffect(() => {
    if (!existingPost) return
    if (userId && existingPost.authorId !== userId) {
      pushToast({ type: "error", message: t("forum.notAuthor") })
      navigate(`/forum/${existingPost.id}`)
      return
    }
    setTitle(existingPost.title)
    setBody(existingPost.body)
    setCategory(existingPost.category)
    setSubcategory(existingPost.subcategory)
  }, [existingPost, userId, navigate, pushToast, t])

  const subcategoryOptions = useMemo(() => subcategoriesForCategory(category), [category])

  useEffect(() => {
    if (!subcategoryOptions.some((s) => s.id === subcategory)) {
      setSubcategory(subcategoryOptions[0]?.id ?? "")
    }
  }, [category, subcategoryOptions, subcategory])

  const pageMeta = usePageMeta(
    isEdit ? t("forum.editPageTitle") : t("forum.newPageTitle"),
    t("forum.metaDescription"),
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errors: Record<string, string> = {}

    const titleResult = validateTextField(title, {
      label: t("forum.titleLabel"),
      min: LIMITS.forumPostTitleMin,
      max: LIMITS.forumPostTitle,
    })
    if (!titleResult.ok) errors.title = titleResult.message

    const bodyResult = validateTextField(body, {
      label: t("forum.bodyLabel"),
      min: LIMITS.forumPostBodyMin,
      max: LIMITS.forumPostBody,
    })
    if (!bodyResult.ok) errors.body = bodyResult.message

    if (!isValidForumCategoryPair(category, subcategory)) {
      errors.category = t("forum.categoryRequired")
    }

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const client = supabase
    if (!client || !userId) return

    setSubmitting(true)
    try {
      if (isEdit && postId) {
        const { error: updateError } = await client
          .from("forum_posts")
          .update({
            title: titleResult.ok ? titleResult.value : title,
            body: bodyResult.ok ? bodyResult.value : body,
            category,
            subcategory,
          })
          .eq("id", postId)
          .eq("author_id", userId)

        if (updateError) throw updateError
        pushToast({ type: "success", message: t("forum.updateSuccess") })
        void queryClient.invalidateQueries({ queryKey: queryKeys.forumPostDetail(postId) })
        void queryClient.invalidateQueries({ queryKey: ["forum-posts"] })
        navigate(`/forum/${postId}`)
      } else {
        await assertContentRateLimit("forum-post")

        const { data: profile } = await client
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("id", userId)
          .maybeSingle()

        const { data: inserted, error: insertError } = await client
          .from("forum_posts")
          .insert({
            author_id: userId,
            author_name: profile?.full_name?.trim() || t("nav.user"),
            author_avatar: profile?.avatar_url ?? null,
            title: titleResult.ok ? titleResult.value : title,
            body: bodyResult.ok ? bodyResult.value : body,
            category,
            subcategory,
          })
          .select("id")
          .single()

        if (insertError) throw insertError
        pushToast({ type: "success", message: t("forum.createSuccess") })
        void queryClient.invalidateQueries({ queryKey: ["forum-posts"] })
        navigate(`/forum/${inserted.id}`)
      }
    } catch (submitError) {
      const rateMsg = formatContentRateLimitError(submitError, t)
      pushToast({
        type: "error",
        message: rateMsg ?? (isEdit ? t("forum.updateError") : t("forum.createError")),
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (!authChecked || (isEdit && isLoading)) {
    return (
      <main className="min-h-[60vh] px-4 pb-16 pt-6 md:pl-12 lg:pl-16">
        {pageMeta}
        <div className="mx-auto max-w-[640px]">
          <SkeletonCard lines={8} />
        </div>
      </main>
    )
  }

  if (isEdit && isError) {
    return (
      <main className="min-h-[60vh] px-4 pb-16 pt-6 md:pl-12 lg:pl-16">
        {pageMeta}
        <div className="mx-auto max-w-[640px]">
          <ErrorState message={queryErrorMessage(error, t("forum.loadError"))} />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[60vh] px-4 pb-16 pt-6 md:pl-12 lg:pl-16">
      {pageMeta}

      <div className="mx-auto max-w-[640px]">
        <Link to="/forum" className="text-sm font-medium text-[#0088FF] hover:underline">
          ← {t("forum.backToForum")}
        </Link>

        <h1 className="mt-4 text-2xl font-extrabold text-[#1B2B4B]">
          {isEdit ? t("forum.editHeading") : t("forum.newHeading")}
        </h1>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
          <div>
            <label htmlFor="forum-title" className="block text-sm font-semibold text-[#1B2B4B]">
              {t("forum.titleLabel")} *
            </label>
            <input
              id="forum-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={fieldClass}
              maxLength={LIMITS.forumPostTitle}
            />
            {fieldErrors.title ? <p className="mt-1 text-sm text-red-600">{fieldErrors.title}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="forum-category" className="block text-sm font-semibold text-[#1B2B4B]">
                {t("forum.categoryLabel")} *
              </label>
              <select
                id="forum-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={fieldClass}
              >
                {FORUM_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {t(forumCategoryLabelKey(cat.id))}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="forum-subcategory" className="block text-sm font-semibold text-[#1B2B4B]">
                {t("forum.subcategoryLabel")} *
              </label>
              <select
                id="forum-subcategory"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                className={fieldClass}
              >
                {subcategoryOptions.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {t(forumSubcategoryLabelKey(category, sub.id))}
                  </option>
                ))}
              </select>
              {fieldErrors.category ? <p className="mt-1 text-sm text-red-600">{fieldErrors.category}</p> : null}
            </div>
          </div>

          <div>
            <label htmlFor="forum-body" className="block text-sm font-semibold text-[#1B2B4B]">
              {t("forum.bodyLabel")} *
            </label>
            <textarea
              id="forum-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className={`${fieldClass} resize-y`}
              maxLength={LIMITS.forumPostBody}
            />
            {fieldErrors.body ? <p className="mt-1 text-sm text-red-600">{fieldErrors.body}</p> : null}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center rounded-lg bg-[#0088FF] px-6 text-sm font-semibold text-white transition hover:bg-[#006ACC] disabled:opacity-60"
            >
              {submitting ? t("forum.submitting") : isEdit ? t("forum.savePost") : t("forum.publishPost")}
            </button>
            <Link
              to={isEdit && postId ? `/forum/${postId}` : "/forum"}
              className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-6 text-sm font-semibold text-[#1B2B4B] transition hover:border-slate-400"
            >
              {t("forum.cancel")}
            </Link>
          </div>
        </form>
      </div>
    </main>
  )
}
