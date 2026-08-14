import { useQuery } from "@tanstack/react-query"
import { jobVacancyStats } from "../jobVacancies.ts"
import { queryKeys } from "../queryKeys.ts"
import { isSupabaseConfigured, supabase } from "../supabase.ts"
import { jobVipIsActive } from "../vipJobTiers.ts"
import type { HomeJobListingItem } from "../homeFeed.ts"

export type RecommendedJobsPayload = {
  jobs: HomeJobListingItem[]
  totalCount: number
}

function normalizeSkillNamesFromSkills(skillsRaw: unknown, max = 12): string[] {
  if (!Array.isArray(skillsRaw)) return []
  const out: string[] = []
  for (const item of skillsRaw) {
    if (!item || typeof item !== "object") continue
    const name = String((item as { name?: unknown }).name ?? "").trim()
    if (name && out.length < max) out.push(name)
  }
  return out
}

function mapRecommendedJobRow(raw: unknown): HomeJobListingItem | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const id = String(row.id ?? "").trim()
  if (!id) return null

  const desc = String(row.description ?? "").replace(/\s+/g, " ").trim()
  const snippet = desc.length > 120 ? `${desc.slice(0, 120)}…` : desc || "დეტალები განცხადების გვერდზე."
  const descriptionEnRaw = String(row.description_en ?? "").replace(/\s+/g, " ").trim()
  const descriptionEnPreview =
    descriptionEnRaw.length > 120 ? `${descriptionEnRaw.slice(0, 120)}…` : descriptionEnRaw || null
  const imagePaths = Array.isArray(row.image_urls)
    ? (row.image_urls as unknown[]).map((v) => String(v)).filter(Boolean)
    : []
  const vac = jobVacancyStats(row.vacancies as number | null | undefined, row.accepted_count as number | null | undefined)
  const companyName =
    String(row.company_name ?? "").trim() || String(row.full_name ?? "").trim() || "დამქირავებელი"

  return {
    kind: "hirer_job",
    id,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    title: String(row.title ?? "").trim() || "სამუშაო",
    titleEn: String(row.title_en ?? "").trim() || null,
    descriptionPreview: snippet,
    descriptionEnPreview,
    imagePath: imagePaths[0] ?? null,
    companyName,
    companyAvatar: row.avatar_url != null ? String(row.avatar_url) : null,
    city: row.city != null ? String(row.city) : null,
    categoryNameKa: String(row.category_name ?? "").trim() || "კატეგორია",
    categoryNameEn: null,
    subcategoryNameKa: row.subcategory_name != null ? String(row.subcategory_name).trim() || null : null,
    subcategoryNameEn: null,
    budgetType: String(row.budget_type ?? "fixed"),
    budgetMin: row.budget_min != null ? Number(row.budget_min) : null,
    budgetMax: row.budget_max != null ? Number(row.budget_max) : null,
    locationType: String(row.location_type ?? "anywhere"),
    durationType: String(row.duration_type ?? "one_time"),
    isUrgent: Boolean(row.is_urgent),
    applicationDeadline: row.application_deadline != null ? String(row.application_deadline) : null,
    applicantsCount: Number(row.applicants_count ?? 0),
    viewsCount: Number(row.views_count ?? 0),
    skillNames: normalizeSkillNamesFromSkills(row.skills),
    hirerAverageRating: 0,
    vipFeatured: jobVipIsActive(Boolean(row.is_vip), row.vip_expires_at != null ? String(row.vip_expires_at) : null),
    vacancies: vac.vacancies,
    acceptedCount: vac.acceptedCount,
  }
}

export async function fetchRecommendedJobs(freelancerId: string): Promise<RecommendedJobsPayload> {
  if (!isSupabaseConfigured || !supabase) {
    return { jobs: [], totalCount: 0 }
  }

  const { data, error } = await supabase.rpc("get_recommended_jobs_for_freelancer", {
    p_freelancer_id: freelancerId,
    p_limit: 12,
  })

  if (error) throw error

  const payload = data as { jobs?: unknown; total_count?: unknown } | null
  const rows = Array.isArray(payload?.jobs) ? payload.jobs : []
  const jobs = rows.map(mapRecommendedJobRow).filter((j): j is HomeJobListingItem => j != null)
  const total = Number(payload?.total_count)
  return {
    jobs,
    totalCount: Number.isFinite(total) ? total : jobs.length,
  }
}

/**
 * Skill-overlap recommendations for the signed-in freelancer.
 * Pass null/undefined or skip enabling when the profile has zero skills.
 */
export function useRecommendedJobs(freelancerId: string | null | undefined, enabled = true) {
  const id = freelancerId?.trim() || ""
  return useQuery({
    queryKey: queryKeys.recommendedJobs(id || "pending"),
    queryFn: () => fetchRecommendedJobs(id),
    enabled: Boolean(id) && enabled && isSupabaseConfigured,
    staleTime: 60_000,
  })
}
