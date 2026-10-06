import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { Link, useParams } from "react-router-dom"
import PageLoader from "../components/ui/PageLoader.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { pickCategoryName } from "../lib/categoryLocale.ts"
import { landingPath } from "../lib/landingPaths.ts"
import { cityFromSlug, cityLocativeKa, citySlug, formatCityForDisplay, GEORGIA_CITY_LABELS } from "../lib/marketplaceFilters.ts"
import { fetchFreelancerLandingIndex } from "../lib/queries/fetchFreelancerLanding.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { usePageMeta } from "../lib/usePageMeta.tsx"
import NotFoundPage from "./NotFound.tsx"

/** In-person service categories (root slugs from the categories table). */
const LOCAL_ROOTS = [
  { slug: "home-services", icon: "🔧" },
  { slug: "tutoring-education", icon: "📚" },
  { slug: "photography", icon: "📷" },
  { slug: "automotive", icon: "🚗" },
  { slug: "lifestyle-personal", icon: "💇" },
] as const

/** Cities shown first on /local; the rest follow by freelancer count. */
const FEATURED_CITIES = ["თბილისი", "ბათუმი", "ქუთაისი", "რუსთავი", "გორი", "ზუგდიდი", "ფოთი", "თელავი"]

/** /local and /local/:city — everyday in-person services (repairs, tutors, photographers, movers…). */
export default function LocalServicesPage() {
  const { t, locale } = useTranslation()
  const { city: citySlugParam } = useParams()
  const city = citySlugParam ? cityFromSlug(citySlugParam) : null
  const cityName = city ? (formatCityForDisplay(city, locale) ?? city) : ""
  const place = city ? (locale === "en" ? ` in ${cityName}` : ` ${cityLocativeKa(city)}`) : ""

  const pageMeta = usePageMeta(
    t("local.title", { place }),
    t("local.metaDescription", { place }),
  )

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.freelancerLandingIndex,
    queryFn: fetchFreelancerLandingIndex,
    staleTime: 10 * 60_000,
  })

  const { categoriesBySlug, countFor, cityTotals } = useMemo(() => {
    const categories = data?.categories ?? []
    const combos = data?.combos ?? []
    const comboCount = new Map(combos.map((c) => [`${c.slug}|${c.city}`, c.count]))
    const totals = new Map<string, number>()
    for (const c of combos) {
      if (LOCAL_ROOTS.some((r) => r.slug === c.slug)) totals.set(c.city, (totals.get(c.city) ?? 0) + c.count)
    }
    return {
      categoriesBySlug: categories,
      countFor: (slug: string) =>
        city ? (comboCount.get(`${slug}|${city}`) ?? 0) : (categories.find((c) => c.slug === slug)?.count ?? 0),
      cityTotals: totals,
    }
  }, [data, city])

  if (citySlugParam && !city) return <NotFoundPage />

  const cityLinks = [
    ...FEATURED_CITIES,
    ...GEORGIA_CITY_LABELS.filter((c) => !FEATURED_CITIES.includes(c)).sort(
      (a, b) => (cityTotals.get(b) ?? 0) - (cityTotals.get(a) ?? 0),
    ),
  ]

  return (
    <>
      {pageMeta}
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6 md:py-10">
        <h1 className="text-3xl font-bold text-[#1B2B4B] md:text-4xl">{t("local.heading", { place })}</h1>
        <p className="mt-3 max-w-3xl text-slate-600">{t("local.intro")}</p>

        <nav aria-label={t("local.chooseCity")} className="mt-6">
          <p className="text-sm font-semibold text-slate-700">{t("local.chooseCity")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              to="/local"
              className={`rounded-full border px-3 py-1 text-sm ${!city ? "border-[#0088FF] bg-[#E8F4FF] text-[#0088FF]" : "border-slate-300 text-slate-700 hover:border-[#0088FF]"}`}
            >
              {t("local.allGeorgia")}
            </Link>
            {cityLinks.slice(0, city ? 30 : 12).map((c) => (
              <Link
                key={c}
                to={`/local/${citySlug(c)}`}
                className={`rounded-full border px-3 py-1 text-sm ${c === city ? "border-[#0088FF] bg-[#E8F4FF] text-[#0088FF]" : "border-slate-300 text-slate-700 hover:border-[#0088FF]"}`}
              >
                {formatCityForDisplay(c, locale)}
              </Link>
            ))}
          </div>
        </nav>

        {isLoading ? (
          <PageLoader />
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {LOCAL_ROOTS.map((root) => {
              const rootRow = categoriesBySlug.find((c) => c.slug === root.slug)
              const children = categoriesBySlug.filter((c) => c.parent_slug === root.slug)
              const rootName = rootRow ? pickCategoryName(rootRow, locale) : t(`local.roots.${root.slug}`)
              return (
                <section key={root.slug} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-[#1B2B4B]">
                    <span aria-hidden>{root.icon}</span>
                    <Link to={landingPath(root.slug, city)} className="hover:text-[#0088FF]">
                      {rootName}
                    </Link>
                    <span className="text-sm font-normal text-slate-400">({countFor(root.slug)})</span>
                  </h2>
                  {children.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {children.map((child) => (
                        <li key={child.slug}>
                          <Link to={landingPath(child.slug, city)} className="text-sm text-slate-600 hover:text-[#0088FF]">
                            {pickCategoryName(child, locale)}{" "}
                            <span className="text-slate-400">({countFor(child.slug)})</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              )
            })}
          </div>
        )}

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-[#0088FF] p-6 text-white">
            <h2 className="text-xl font-bold">{t("local.hireTitle", { place })}</h2>
            <p className="mt-2 text-sm text-white/90">{t("local.hireBody")}</p>
            <Link
              to="/post-job"
              className="mt-4 inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-bold text-[#0088FF] hover:bg-[#E8F4FF]"
            >
              {t("nav.postJob")}
            </Link>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-bold text-[#1B2B4B]">{t("local.joinTitle")}</h2>
            <p className="mt-2 text-sm text-slate-600">{t("local.joinBody")}</p>
            <Link
              to="/register"
              className="mt-4 inline-flex h-11 items-center rounded-full bg-[#1B2B4B] px-5 text-sm font-bold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]"
            >
              {t("nav.register")}
            </Link>
          </div>
        </section>
      </main>
    </>
  )
}
