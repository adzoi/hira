import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import ForumCategoryFilter from "../components/ForumCategoryFilter.tsx"
import ForumPostCard from "../components/ForumPostCard.tsx"
import EmptyState from "../components/ui/EmptyState.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import { useToast } from "../components/ui/ToastProvider.tsx"
import { fetchForumPosts } from "../lib/queries/fetchForumPosts.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase.ts"
import { getAuthenticatedSession } from "../lib/supabaseAuth.ts"
import { usePageMeta } from "../lib/usePageMeta.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"

type ViewMode = "all" | "mine"

export default function ForumPage() {
  const { t } = useTranslation()
  const { pushToast } = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [userId, setUserId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  const selectedCategory = searchParams.get("category")
  const selectedSubcategory = searchParams.get("subcategory")
  const viewMode: ViewMode = searchParams.get("mine") === "1" ? "mine" : "all"

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

  const isAuthed = Boolean(userId)
  const showMine = viewMode === "mine" && isAuthed

  const filters = useMemo(
    () => ({
      category: selectedCategory ?? undefined,
      subcategory: selectedSubcategory ?? undefined,
      mine: showMine,
      userId: showMine ? userId ?? undefined : undefined,
    }),
    [selectedCategory, selectedSubcategory, showMine, userId],
  )

  const { data: posts, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.forumPosts(filters),
    queryFn: async () => {
      const client = supabase
      if (!client || !isSupabaseConfigured) return []
      return fetchForumPosts(client, {
        category: selectedCategory,
        subcategory: selectedSubcategory,
        authorId: showMine ? userId : null,
      })
    },
    enabled: authChecked && (!showMine || Boolean(userId)),
  })

  const setViewMode = (mode: ViewMode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (mode === "mine") next.set("mine", "1")
      else next.delete("mine")
      return next
    })
  }

  const setCategory = (categoryId: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (categoryId) next.set("category", categoryId)
      else next.delete("category")
      next.delete("subcategory")
      return next
    })
  }

  const setSubcategory = (subcategoryId: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (subcategoryId) next.set("subcategory", subcategoryId)
      else next.delete("subcategory")
      return next
    })
  }

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm(t("forum.deletePostConfirm"))) return
    const client = supabase
    if (!client) return
    const { error: deleteError } = await client.from("forum_posts").delete().eq("id", postId)
    if (deleteError) {
      pushToast({ type: "error", message: t("forum.deletePostError") })
      return
    }
    pushToast({ type: "success", message: t("forum.deletePostSuccess") })
    void queryClient.invalidateQueries({ queryKey: ["forum-posts"] })
  }

  const pageMeta = usePageMeta(t("forum.pageTitle"), t("forum.metaDescription"))

  return (
    <main className="min-h-[60vh] px-4 pb-16 pt-6 md:pl-12 lg:pl-16">
      {pageMeta}

      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1B2B4B] md:text-3xl">{t("forum.heading")}</h1>
            <p className="mt-1 text-sm text-slate-600">{t("forum.subheading")}</p>
          </div>
          {isAuthed ? (
            <Link
              to="/forum/new"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-[#0088FF] px-5 text-sm font-semibold text-white transition hover:bg-[#006ACC]"
            >
              {t("forum.addPost")}
            </Link>
          ) : null}
        </div>

        {isAuthed ? (
          <div className="mt-6 inline-flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setViewMode("all")}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                viewMode === "all"
                  ? "bg-[#0088FF] text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t("forum.allPosts")}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("mine")}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                viewMode === "mine"
                  ? "bg-[#0088FF] text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t("forum.myPosts")}
            </button>
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr] xl:grid-cols-[260px_1fr]">
          <ForumCategoryFilter
            selectedCategory={selectedCategory}
            selectedSubcategory={selectedSubcategory}
            onSelectCategory={setCategory}
            onSelectSubcategory={setSubcategory}
          />

          <section>
            {isLoading ? (
              <div className="grid gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : isError ? (
              <ErrorState message={queryErrorMessage(error, t("forum.loadError"))} onRetry={() => void refetch()} />
            ) : !posts?.length ? (
              <EmptyState
                message={showMine ? t("forum.emptyMine") : t("forum.emptyAll")}
                actionLabel={isAuthed ? t("forum.addPost") : undefined}
                onAction={isAuthed ? () => navigate("/forum/new") : undefined}
              />
            ) : (
              <div className="grid gap-4">
                {posts.map((post) => (
                  <ForumPostCard
                    key={post.id}
                    post={post}
                    showActions={showMine}
                    onEdit={() => navigate(`/forum/${post.id}/edit`)}
                    onDelete={() => void handleDeletePost(post.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
