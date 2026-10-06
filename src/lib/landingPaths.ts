import { citySlug } from "./marketplaceFilters.ts"

/** Public SEO landing URL: /freelancers/:category or /freelancers/:category/:city (Latin city slug). */
export function landingPath(categorySlug: string, city?: string | null): string {
  const slug = city ? citySlug(city) : null
  return slug ? `/freelancers/${categorySlug}/${slug}` : `/freelancers/${categorySlug}`
}
