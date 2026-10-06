import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { OptimizedImage } from "../components/OptimizedImage.tsx"
import PageLoader from "../components/ui/PageLoader.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { pickCategoryName } from "../lib/categoryLocale.ts"
import { landingPath } from "../lib/landingPaths.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { supabase } from "../lib/supabase"
import { usePageMeta } from "../lib/usePageMeta.tsx"

type DailyPoint = { day: string; views: number; impressions: number }

type FreelancerStats = {
  days: number
  daily: DailyPoint[]
  totals: {
    views: number
    views_prev: number
    impressions: number
    impressions_prev: number
    hirer_visitors: number
    anonymous_views: number
  }
  hirer_visitors: Array<{
    hirer_profile_id: string
    full_name: string | null
    avatar_url: string | null
    company_name: string | null
    visited_at: string
    visits: number
  }>
  category_rank: { name_ka: string; name_en: string | null; slug: string; total: number; rank: number } | null
}

const PERIODS = [7, 30, 90] as const

async function fetchStats(days: number): Promise<FreelancerStats | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc("get_my_freelancer_stats", { p_days: days })
  if (error) throw error
  return (data as FreelancerStats | null) ?? null
}

function changeLabel(current: number, previous: number): { text: string; positive: boolean } | null {
  if (previous <= 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, positive: pct >= 0 }
}

function StatTile({ label, value, previous, hint }: { label: string; value: number; previous?: number; hint?: string }) {
  const change = previous === undefined ? null : changeLabel(value, previous)
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 flex items-baseline gap-2 text-3xl font-bold text-[#1B2B4B]">
        {value.toLocaleString("en-US")}
        {change ? (
          <span className={`text-sm font-semibold ${change.positive ? "text-emerald-600" : "text-red-500"}`}>{change.text}</span>
        ) : null}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  )
}

/** Two-series bar chart (views vs. search appearances) drawn with plain divs. */
function DailyChart({ daily, locale }: { daily: DailyPoint[]; locale: string }) {
  const { t } = useTranslation()
  const max = Math.max(1, ...daily.map((d) => Math.max(d.views, d.impressions)))
  const dateFormat = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ka-GE", { month: "short", day: "numeric" })
  return (
    <div>
      <div className="flex h-48 items-end gap-[2px]" role="img" aria-label={t("stats.chartLabel")}>
        {daily.map((d) => (
          <div
            key={d.day}
            className="flex h-full min-w-0 flex-1 items-end gap-[1px]"
            title={`${dateFormat.format(new Date(d.day))}: ${t("stats.views")} ${d.views}, ${t("stats.impressions")} ${d.impressions}`}
          >
            <div className="flex-1 rounded-t bg-[#BFE0FF]" style={{ height: `${(d.impressions / max) * 100}%` }} />
            <div className="flex-1 rounded-t bg-[#0088FF]" style={{ height: `${(d.views / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-400">
        <span>{daily[0] ? dateFormat.format(new Date(daily[0].day)) : ""}</span>
        <span>{daily.length ? dateFormat.format(new Date(daily[daily.length - 1].day)) : ""}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-[#0088FF]" /> {t("stats.views")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-[#BFE0FF]" /> {t("stats.impressions")}
        </span>
      </div>
    </div>
  )
}

export default function FreelancerStatsPage() {
  const { t, locale } = useTranslation()
  const pageMeta = usePageMeta(t("stats.title"), undefined, undefined, { noindex: true })
  const [days, setDays] = useState<number>(30)
  const [userId, setUserId] = useState("")

  useEffect(() => {
    void supabase?.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? ""))
  }, [])

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.freelancerStats(userId, days),
    queryFn: () => fetchStats(days),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const relativeDate = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ka-GE", { month: "short", day: "numeric" })

  return (
    <>
      {pageMeta}
      <main className="mx-auto w-full max-w-[1100px] px-4 py-8 md:px-6">
        <Link to="/dashboard" className="text-sm font-medium text-slate-600 hover:text-[#0088FF]">
          ← {t("nav.dashboard")}
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[#1B2B4B] md:text-3xl">{t("stats.heading")}</h1>
          <div className="inline-flex rounded-full border border-slate-300 bg-white p-0.5 text-sm font-semibold">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setDays(p)}
                className={`rounded-full px-3 py-1 ${days === p ? "bg-[#1B2B4B] text-white" : "text-slate-600"}`}
              >
                {t("stats.lastDays", { count: p })}
              </button>
            ))}
          </div>
        </div>

        {isLoading || !userId ? (
          <PageLoader />
        ) : isError ? (
          <p className="mt-8 text-slate-500">{t("stats.loadError")}</p>
        ) : !data ? (
          <p className="mt-8 text-slate-500">{t("stats.freelancersOnly")}</p>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label={t("stats.views")} value={data.totals.views} previous={data.totals.views_prev} />
              <StatTile
                label={t("stats.impressions")}
                value={data.totals.impressions}
                previous={data.totals.impressions_prev}
                hint={t("stats.impressionsHint")}
              />
              <StatTile label={t("stats.hirerVisitors")} value={data.totals.hirer_visitors} />
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">{t("stats.categoryRank")}</p>
                {data.category_rank ? (
                  <>
                    <p className="mt-2 text-3xl font-bold text-[#1B2B4B]">
                      #{data.category_rank.rank}
                      <span className="text-base font-normal text-slate-400"> / {data.category_rank.total}</span>
                    </p>
                    <Link
                      to={landingPath(data.category_rank.slug)}
                      className="mt-1 block truncate text-xs text-[#0088FF] hover:underline"
                    >
                      {pickCategoryName(data.category_rank, locale)}
                    </Link>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    <Link to="/profile" className="text-[#0088FF] hover:underline">
                      {t("stats.addSkillsForRank")}
                    </Link>
                  </p>
                )}
              </div>
            </div>

            <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-[#1B2B4B]">{t("stats.dailyHeading")}</h2>
              <div className="mt-4">
                <DailyChart daily={data.daily ?? []} locale={locale} />
              </div>
              {data.category_rank ? (
                <p className="mt-4 text-xs text-slate-500">{t("stats.rankExplainer")}</p>
              ) : null}
            </section>

            <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-[#1B2B4B]">{t("stats.whoViewed")}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("stats.whoViewedHint", { anonymous: data.totals.anonymous_views })}
              </p>
              {data.hirer_visitors.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">{t("stats.noHirerVisitors")}</p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100">
                  {data.hirer_visitors.map((visitor) => {
                    const name = visitor.company_name || visitor.full_name || t("nav.user")
                    const avatar = avatarImageUrl(supabase, visitor.avatar_url)
                    return (
                      <li key={visitor.hirer_profile_id}>
                        <Link
                          to={`/hirer/${visitor.hirer_profile_id}`}
                          className="flex items-center gap-3 py-3 hover:bg-slate-50"
                        >
                          {avatar ? (
                            <OptimizedImage src={avatar} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1B2B4B] text-sm font-bold text-white">
                              {name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-[#1B2B4B]">{name}</p>
                            {visitor.company_name && visitor.full_name ? (
                              <p className="truncate text-xs text-slate-500">{visitor.full_name}</p>
                            ) : null}
                          </div>
                          <span className="shrink-0 text-xs text-slate-400">
                            {relativeDate.format(new Date(visitor.visited_at))}
                            {visitor.visits > 1 ? ` · ×${visitor.visits}` : ""}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </>
  )
}
