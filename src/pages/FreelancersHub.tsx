import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { Link } from "react-router-dom"
import PageLoader from "../components/ui/PageLoader.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { pickCategoryName } from "../lib/categoryLocale.ts"
import { landingPath } from "../lib/landingPaths.ts"
import { citySlug, formatCityForDisplay } from "../lib/marketplaceFilters.ts"
import { fetchFreelancerLandingIndex } from "../lib/queries/fetchFreelancerLanding.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { usePageMeta } from "../lib/usePageMeta.tsx"

/** /freelancers — every category with public freelancers, linking to the SEO landing pages. */
export default function FreelancersHubPage() {
  const { t, locale } = useTranslation()
  const pageMeta = usePageMeta(t("landing.hubTitle"), t("landing.hubMetaDescription"))
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.freelancerLandingIndex,
    queryFn: fetchFreelancerLandingIndex,
    staleTime: 10 * 60_000,
  })

  const groups = useMemo(() => {
    const categories = data?.categories ?? []
    const roots = categories.filter((c) => !c.parent_slug)
    return roots.map((root) => ({
      root,
      children: categories.filter((c) => c.parent_slug === root.slug),
    }))
  }, [data])

  const topCities = useMemo(() => {
    const totals = new Map<string, number>()
    for (const combo of data?.combos ?? []) {
      if (!citySlug(combo.city)) continue
      totals.set(combo.city, Math.max(totals.get(combo.city) ?? 0, combo.count))
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [data])

  return (
    <>
      {pageMeta}
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6 md:py-10">
        <h1 className="text-3xl font-bold text-[#1B2B4B] md:text-4xl">{t("landing.hubHeading")}</h1>
        <p className="mt-3 max-w-3xl text-slate-600">{t("landing.hubIntro")}</p>

        {topCities.length > 0 ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {topCities.map(([city]) => (
              <Link
                key={city}
                to={`/local/${citySlug(city)}`}
                className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:border-[#0088FF] hover:text-[#0088FF]"
              >
                📍 {formatCityForDisplay(city, locale)}
              </Link>
            ))}
          </div>
        ) : null}

        {isLoading ? (
          <PageLoader />
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {groups.map(({ root, children }) => (
              <section key={root.slug} className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-bold text-[#1B2B4B]">
                  <Link to={landingPath(root.slug)} className="hover:text-[#0088FF]">
                    {pickCategoryName(root, locale)}
                  </Link>{" "}
                  <span className="text-sm font-normal text-slate-400">({root.count})</span>
                </h2>
                {children.length > 0 ? (
                  <ul className="mt-3 space-y-1.5">
                    {children.map((child) => (
                      <li key={child.slug}>
                        <Link to={landingPath(child.slug)} className="text-sm text-slate-600 hover:text-[#0088FF]">
                          {pickCategoryName(child, locale)} <span className="text-slate-400">({child.count})</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
