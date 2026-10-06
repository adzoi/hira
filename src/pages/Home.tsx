import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import HomeFeedSection from "../components/HomeFeedSection.tsx"
import { OptimizedImage } from "../components/OptimizedImage.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { translate } from "../i18n/translate.ts"
import { useHomeStatsQuery } from "../lib/queries/useHomeStatsQuery.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { normalizeSearchInput } from "../lib/validation.ts"
import { usePageMeta } from "../lib/usePageMeta.tsx"

/** Same URL the static LCP shell in index.html already fetched — reusing it avoids a second 86 KB download. */
const mainHeroImage = "/images/main.webp"

function formatNumber(value: number) {
  return value.toLocaleString("en-US").replace(/,/g, " ")
}

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState("")
  const [viewerType, setViewerType] = useState<"freelancer" | "hirer" | null>(null)
  const { data: stats = { freelancerCount: 0, jobCount: 0, completedCount: 0 } } = useHomeStatsQuery()
  const pageMeta = usePageMeta(
    translate("ka", "home.title"),
    translate("ka", "home.metaDescription"),
  )

  useEffect(() => {
    let cancelled = false
    const loadViewerType = async () => {
      if (!isSupabaseConfigured || !supabase) return
      // Local session is enough here (UI hint only; RLS guards the data) — avoids an auth-server round trip.
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const user = session?.user
      if (cancelled || !user) return
      const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", user.id).maybeSingle()
      if (cancelled) return
      const ut = profile?.user_type
      if (ut === "freelancer" || ut === "hirer") setViewerType(ut)
    }
    void loadViewerType()
    return () => {
      cancelled = true
    }
  }, [])

  const showStatsBar = stats.freelancerCount >= 10

  const handleSearch = () => {
    const trimmed = normalizeSearchInput(searchText)
    const searchPath = viewerType === "freelancer" ? "/jobs" : "/listings"
    if (!trimmed) {
      navigate(searchPath)
      return
    }
    navigate(`${searchPath}?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <>
      {pageMeta}
      <main className="page-enter">
        <section className="bg-[#0088FF]">
          <div className="mx-auto grid w-full max-w-[1200px] items-stretch gap-8 px-4 py-10 md:px-6 lg:grid-cols-2 lg:py-16">
            <div className="flex flex-col justify-center">
              <h1 className="home-hero-title mt-3">
                <span className="block text-[36px] font-bold tracking-tight text-[#F7CE50] drop-shadow-sm lg:text-[58px]">
                  {t("home.heroBrand")}
                </span>
                <span className="home-hero-tagline mt-1 block font-bold text-white lg:mt-2">
                  {t("home.heroTagline")}
                </span>
              </h1>

              <div className="mt-8 flex flex-row items-center gap-2 rounded-xl bg-white p-3 shadow-lg">
                <input
                  type="text"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSearch()
                  }}
                  placeholder={t("home.searchPlaceholder")}
                  className="h-10 min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-500 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:ring-2 focus:ring-[#0088FF]"
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-white px-4 text-sm font-bold text-[#0088FF] transition hover:bg-[#E8F4FF] sm:px-8 sm:text-base"
                >
                  {t("common.search")}
                </button>
              </div>
            </div>

            <div className="hidden min-h-0 items-center justify-center md:flex">
              <OptimizedImage
                src={mainHeroImage}
                alt={`${t("brand.name")} - ${t("brand.taglineShort")}`}
                width={1024}
                height={684}
                loading="eager"
                fetchPriority="high"
                className="h-auto w-full max-w-lg rounded-2xl object-contain drop-shadow-lg lg:max-w-none"
              />
            </div>
          </div>
        </section>

        <HomeFeedSection />

        {showStatsBar ? (
          <section className="border-x border-b border-slate-200 bg-white">
            <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-6 px-4 py-8 text-center md:grid-cols-3 md:px-6">
              <div>
                <p className="text-3xl font-bold text-[#1B2B4B]">
                  {stats.freelancerCount > 0 ? formatNumber(stats.freelancerCount) : t("home.growingDaily")}
                </p>
                <p className="mt-1 text-sm text-slate-500">{t("home.registeredFreelancers")}</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-[#1B2B4B]">
                  {stats.jobCount > 0 ? formatNumber(stats.jobCount) : t("home.growingDaily")}
                </p>
                <p className="mt-1 text-sm text-slate-500">{t("home.postedListings")}</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-[#1B2B4B]">
                  {stats.completedCount > 0 ? formatNumber(stats.completedCount) : t("home.growingDaily")}
                </p>
                <p className="mt-1 text-sm text-slate-500">{t("home.completedJobs")}</p>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </>
  )
}
