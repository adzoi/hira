import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { queryKeys } from "../lib/queryKeys.ts"
import { supabase } from "../lib/supabase"
import FreelancerMiniCard, { type FreelancerMiniCardData } from "./FreelancerMiniCard.tsx"

async function fetchSimilarFreelancers(slug: string): Promise<FreelancerMiniCardData[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc("get_similar_freelancers", { p_slug: slug, p_limit: 6 })
  if (error) throw error
  return Array.isArray(data) ? (data as FreelancerMiniCardData[]) : []
}

/** "Similar freelancers" rail at the bottom of a public profile. Renders nothing when empty. */
export default function SimilarFreelancers({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const { data = [] } = useQuery({
    queryKey: queryKeys.similarFreelancers(slug),
    queryFn: () => fetchSimilarFreelancers(slug),
    staleTime: 10 * 60_000,
  })

  if (data.length === 0) return null

  return (
    <section className="mt-10" aria-labelledby="similar-freelancers-heading">
      <h2 id="similar-freelancers-heading" className="text-xl font-bold text-[#1B2B4B]">
        {t("similar.freelancersHeading")}
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((freelancer) => (
          <FreelancerMiniCard key={freelancer.slug} freelancer={freelancer} />
        ))}
      </div>
    </section>
  )
}
