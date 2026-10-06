import { useQuery } from "@tanstack/react-query"
import { Link, useSearchParams } from "react-router-dom"
import PageLoader from "../components/ui/PageLoader.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { pickCategoryName } from "../lib/categoryLocale.ts"
import { formatJobBudget } from "../lib/listingPrice.ts"
import { formatCityForDisplay } from "../lib/marketplaceFilters.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { supabase } from "../lib/supabase"
import { usePageMeta } from "../lib/usePageMeta.tsx"

type EntryLevelKind = "all" | "internship" | "beginner"

type EntryLevelJob = {
  id: string
  title: string
  title_en: string | null
  budget_type: string
  budget_min: number | null
  budget_max: number | null
  location_type: string
  created_at: string
  is_internship: boolean
  is_beginner_friendly: boolean
  company_name: string | null
  city: string | null
  category_name_ka: string | null
  category_name_en: string | null
}

const KINDS: EntryLevelKind[] = ["all", "internship", "beginner"]

async function fetchEntryLevelJobs(kind: EntryLevelKind): Promise<{ jobs: EntryLevelJob[]; total: number }> {
  if (!supabase) return { jobs: [], total: 0 }
  const { data, error } = await supabase.rpc("get_entry_level_jobs", { p_kind: kind, p_limit: 50, p_offset: 0 })
  if (error) throw error
  const payload = (data ?? {}) as { jobs?: EntryLevelJob[]; total_count?: number }
  return { jobs: payload.jobs ?? [], total: payload.total_count ?? 0 }
}

/** /internships — internships and beginner-friendly jobs for students and first-jobbers. */
export default function InternshipsPage() {
  const { t, locale } = useTranslation()
  const [params, setParams] = useSearchParams()
  const kindParam = params.get("type")
  const kind: EntryLevelKind = kindParam === "internship" || kindParam === "beginner" ? kindParam : "all"
  const pageMeta = usePageMeta(t("entryLevel.pageTitle"), t("entryLevel.metaDescription"))

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.entryLevelJobs(kind),
    queryFn: () => fetchEntryLevelJobs(kind),
    staleTime: 60_000,
  })

  return (
    <>
      {pageMeta}
      <main className="mx-auto w-full max-w-[1100px] px-4 py-8 md:px-6 md:py-10">
        <section className="rounded-2xl bg-[#1B2B4B] p-6 text-white md:p-8">
          <h1 className="text-3xl font-bold md:text-4xl">{t("entryLevel.heading")}</h1>
          <p className="mt-3 max-w-2xl text-white/85">{t("entryLevel.intro")}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/register"
              className="inline-flex h-11 items-center rounded-full bg-[#F7CE50] px-5 text-sm font-bold text-[#1B2B4B] hover:bg-white"
            >
              {t("entryLevel.studentCta")}
            </Link>
            <Link
              to="/post-job"
              className="inline-flex h-11 items-center rounded-full border border-white/40 px-5 text-sm font-semibold text-white hover:bg-white/10"
            >
              {t("entryLevel.companyCta")}
            </Link>
          </div>
        </section>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-slate-300 bg-white p-0.5 text-sm font-semibold">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setParams(k === "all" ? {} : { type: k }, { replace: true })}
                className={`rounded-full px-4 py-1.5 ${kind === k ? "bg-[#0088FF] text-white" : "text-slate-600"}`}
              >
                {t(`entryLevel.tabs.${k}`)}
              </button>
            ))}
          </div>
          {data ? <p className="text-sm text-slate-500">{t("entryLevel.count", { count: data.total })}</p> : null}
        </div>

        {isLoading ? (
          <PageLoader />
        ) : isError ? (
          <p className="mt-8 text-slate-500">{t("entryLevel.loadError")}</p>
        ) : !data || data.jobs.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="font-semibold text-[#1B2B4B]">{t("entryLevel.emptyTitle")}</p>
            <p className="mt-2 text-sm text-slate-600">{t("entryLevel.emptyBody")}</p>
            <Link to="/jobs" className="mt-4 inline-block font-semibold text-[#0088FF] hover:underline">
              {t("entryLevel.browseAllJobs")}
            </Link>
          </div>
        ) : (
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {data.jobs.map((job) => {
              const category = job.category_name_ka
                ? pickCategoryName({ name_ka: job.category_name_ka, name_en: job.category_name_en }, locale)
                : ""
              const meta = [job.company_name, formatCityForDisplay(job.city, locale), category].filter(Boolean).join(" · ")
              return (
                <li key={job.id}>
                  <Link
                    to={`/job/${job.id}`}
                    className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 transition hover:border-[#0088FF] hover:shadow-sm"
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {job.is_internship ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                          {t("entryLevel.internship")}
                        </span>
                      ) : null}
                      {job.is_beginner_friendly ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                          {t("entryLevel.beginnerFriendly")}
                        </span>
                      ) : null}
                    </div>
                    <span className="mt-2 line-clamp-2 text-lg font-semibold text-[#1B2B4B]">
                      {(locale === "en" && job.title_en?.trim()) || job.title}
                    </span>
                    {meta ? <span className="mt-1 truncate text-sm text-slate-500">{meta}</span> : null}
                    <span className="mt-auto pt-3 text-sm font-semibold text-[#0088FF]">
                      {formatJobBudget(job.budget_min, job.budget_max, job.budget_type, locale)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </>
  )
}
