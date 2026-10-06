import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"
import FreelancerMiniCard from "../components/FreelancerMiniCard.tsx"
import PageLoader from "../components/ui/PageLoader.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import type { AppLocale } from "../i18n/types.ts"
import { pickCategoryName } from "../lib/categoryLocale.ts"
import { landingPath } from "../lib/landingPaths.ts"
import { formatJobBudget } from "../lib/listingPrice.ts"
import { cityFromSlug, cityLocativeKa, citySlug, formatCityForDisplay } from "../lib/marketplaceFilters.ts"
import { fetchFreelancerLanding } from "../lib/queries/fetchFreelancerLanding.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { JsonLd } from "../lib/structuredData.tsx"
import { SITE_BASE_URL, usePageMeta } from "../lib/usePageMeta.tsx"
import NotFoundPage from "./NotFound.tsx"

/** "Web development in Tbilisi" style heading fragment for the active locale. */
function placePhrase(city: string | null, locale: AppLocale): string {
  if (!city) return ""
  return locale === "en" ? ` in ${formatCityForDisplay(city, "en") ?? city}` : ` ${cityLocativeKa(city)}`
}

export default function FreelancerLandingPage() {
  const { t, locale } = useTranslation()
  const { category = "", city: citySlugParam } = useParams()
  const city = citySlugParam ? cityFromSlug(citySlugParam) : null
  const unknownCity = Boolean(citySlugParam) && !city

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.freelancerLanding(category, city ?? ""),
    queryFn: () => fetchFreelancerLanding(category, city),
    enabled: !unknownCity && category.length > 0,
    staleTime: 5 * 60_000,
  })

  const categoryName = data ? pickCategoryName(data.category, locale) : ""
  const place = placePhrase(city, locale)
  const total = data?.total_count ?? 0
  const title = data
    ? t("landing.title", { category: categoryName, place })
    : t("landing.fallbackTitle")
  const description = data
    ? t(total > 0 ? "landing.metaDescription" : "landing.metaDescriptionEmpty", {
        category: categoryName,
        place,
        count: total,
      })
    : undefined
  const canonical = data ? `${SITE_BASE_URL}${landingPath(data.category.slug, city)}` : undefined
  const pageMeta = usePageMeta(title, description, canonical, { noindex: total === 0 })

  if (unknownCity || (!isLoading && !isError && data === null)) return <NotFoundPage />
  if (isLoading || !data) {
    return (
      <>
        {pageMeta}
        {isError ? (
          <main className="mx-auto w-full max-w-[1200px] px-4 py-16 text-center text-slate-500">{t("landing.loadError")}</main>
        ) : (
          <PageLoader />
        )}
      </>
    )
  }

  const breadcrumbs = [
    { name: t("nav.home"), path: "/" },
    { name: t("landing.allCategories"), path: "/freelancers" },
    ...(data.parent ? [{ name: pickCategoryName(data.parent, locale), path: landingPath(data.parent.slug) }] : []),
    { name: categoryName, path: landingPath(data.category.slug) },
    ...(city ? [{ name: formatCityForDisplay(city, locale) ?? city, path: landingPath(data.category.slug, city) }] : []),
  ]

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((crumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
        item: `${SITE_BASE_URL}${crumb.path}`,
      })),
    },
    ...(data.freelancers.length > 0
      ? [
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: title,
            itemListElement: data.freelancers.map((f, index) => ({
              "@type": "ListItem",
              position: index + 1,
              url: `${SITE_BASE_URL}/freelancer/${encodeURIComponent(f.slug)}`,
              name: f.full_name ?? undefined,
            })),
          },
        ]
      : []),
  ]

  const otherCities = data.cities.filter((c) => c.city !== city && citySlug(c.city))

  return (
    <>
      {pageMeta}
      <JsonLd data={structuredData} />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6 md:py-10">
        <nav aria-label="breadcrumb" className="text-sm text-slate-500">
          <ol className="flex flex-wrap items-center gap-1.5">
            {breadcrumbs.map((crumb, index) => (
              <li key={crumb.path} className="flex items-center gap-1.5">
                {index > 0 ? <span aria-hidden>›</span> : null}
                {index === breadcrumbs.length - 1 ? (
                  <span className="text-slate-700">{crumb.name}</span>
                ) : (
                  <Link to={crumb.path} className="hover:text-[#0088FF]">
                    {crumb.name}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <h1 className="mt-4 text-3xl font-bold text-[#1B2B4B] md:text-4xl">
          {t("landing.heading", { category: categoryName, place })}
        </h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          {total > 0
            ? t("landing.intro", { count: total, category: categoryName, place })
            : t("landing.introEmpty", { category: categoryName, place })}
        </p>

        {otherCities.length > 0 || city ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {city ? (
              <Link
                to={landingPath(data.category.slug)}
                className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:border-[#0088FF] hover:text-[#0088FF]"
              >
                {t("landing.allCities")}
              </Link>
            ) : null}
            {otherCities.slice(0, 12).map((c) => (
              <Link
                key={c.city}
                to={landingPath(data.category.slug, c.city)}
                className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:border-[#0088FF] hover:text-[#0088FF]"
              >
                {formatCityForDisplay(c.city, locale)} <span className="text-slate-400">({c.count})</span>
              </Link>
            ))}
          </div>
        ) : null}

        {data.freelancers.length > 0 ? (
          <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.freelancers.map((freelancer) => (
              <FreelancerMiniCard key={freelancer.slug} freelancer={freelancer} />
            ))}
          </section>
        ) : null}

        {total > data.freelancers.length ? (
          <div className="mt-6 text-center">
            <Link to="/browse" className="font-semibold text-[#0088FF] hover:underline">
              {t("landing.seeAll", { count: total })}
            </Link>
          </div>
        ) : null}

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-[#0088FF] p-6 text-white">
            <h2 className="text-xl font-bold">{t("landing.hireCtaTitle", { category: categoryName })}</h2>
            <p className="mt-2 text-sm text-white/90">{t("landing.hireCtaBody")}</p>
            <Link
              to="/post-job"
              className="mt-4 inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-bold text-[#0088FF] hover:bg-[#E8F4FF]"
            >
              {t("nav.postJob")}
            </Link>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-bold text-[#1B2B4B]">{t("landing.joinCtaTitle", { category: categoryName })}</h2>
            <p className="mt-2 text-sm text-slate-600">{t("landing.joinCtaBody")}</p>
            <Link
              to="/register"
              className="mt-4 inline-flex h-11 items-center rounded-full bg-[#1B2B4B] px-5 text-sm font-bold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]"
            >
              {t("nav.register")}
            </Link>
          </div>
        </section>

        {data.jobs.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-bold text-[#1B2B4B]">{t("landing.openJobs", { category: categoryName })}</h2>
            <ul className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {data.jobs.map((job) => (
                <li key={job.id}>
                  <Link to={`/job/${job.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 hover:bg-slate-50">
                    <span className="font-medium text-[#1B2B4B]">
                      {(locale === "en" && job.title_en?.trim()) || job.title}
                    </span>
                    <span className="text-sm font-semibold text-slate-600">
                      {formatJobBudget(job.budget_min, job.budget_max, job.budget_type, locale)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {data.related.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-bold text-[#1B2B4B]">{t("landing.related")}</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {data.related.map((r) => (
                <Link
                  key={r.slug}
                  to={landingPath(r.slug, city)}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-[#E8F4FF] hover:text-[#0088FF]"
                >
                  {pickCategoryName(r, locale)}
                  {place} <span className="text-slate-400">({r.count})</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </>
  )
}
