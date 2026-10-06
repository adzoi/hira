import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { formatJobBudget } from "../lib/listingPrice.ts"
import { formatCityForDisplay } from "../lib/marketplaceFilters.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { supabase } from "../lib/supabase"

type SimilarJob = {
  id: string
  title: string
  title_en: string | null
  budget_type: string
  budget_min: number | null
  budget_max: number | null
  location_type: string
  created_at: string
  company_name: string | null
  city: string | null
}

async function fetchSimilarJobs(jobId: string): Promise<SimilarJob[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc("get_similar_jobs", { p_job_id: jobId, p_limit: 6 })
  if (error) throw error
  return Array.isArray(data) ? (data as SimilarJob[]) : []
}

/** "Jobs like this" list under a job post. Renders nothing when empty. */
export default function SimilarJobs({ jobId }: { jobId: string }) {
  const { t, locale } = useTranslation()
  const { data = [] } = useQuery({
    queryKey: queryKeys.similarJobs(jobId),
    queryFn: () => fetchSimilarJobs(jobId),
    staleTime: 5 * 60_000,
  })

  if (data.length === 0) return null

  return (
    <section className="mt-6" aria-labelledby="similar-jobs-heading">
      <h2 id="similar-jobs-heading" className="text-xl font-bold text-[#1B2B4B]">
        {t("similar.jobsHeading")}
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {data.map((job) => {
          const city = formatCityForDisplay(job.city, locale)
          return (
            <li key={job.id}>
              <Link
                to={`/job/${job.id}`}
                className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 transition hover:border-[#0088FF] hover:shadow-sm"
              >
                <span className="line-clamp-2 font-semibold text-[#1B2B4B]">
                  {(locale === "en" && job.title_en?.trim()) || job.title}
                </span>
                <span className="mt-1 truncate text-sm text-slate-500">
                  {[job.company_name, city].filter(Boolean).join(" · ")}
                </span>
                <span className="mt-auto pt-2 text-sm font-semibold text-[#0088FF]">
                  {formatJobBudget(job.budget_min, job.budget_max, job.budget_type, locale)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
