import { jobVacancyStats } from "../jobVacancies.ts"
import { recordProfileVisit } from "../profileVisits.ts"
import { isSupabaseConfigured, supabase } from "../supabase.ts"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type HirerLoaded = {
  id: string
  ownerUserId: string
  companyName: string
  industry: string | null
  description: string | null
  websiteUrl: string | null
  jobsPosted: number
  completedJobs: number
  contactName: string
  avatarUrl: string | null
  city: string | null
}

export type OpenJobBrief = {
  id: string
  title: string
  budgetMin: number | null
  budgetMax: number | null
  budgetType: string
  vacancies: number
  acceptedCount: number
}

export type HirerReviewDisplay = {
  id: string
  reviewer_id: string
  review_text: string
  rating_overall: number
  created_at: string
  reviewer_name: string
}

export type HirerPublicData = {
  hirer: HirerLoaded | null
  openJobs: OpenJobBrief[]
  hirerReviews: HirerReviewDisplay[]
  documentTitle: string
  invalidId?: boolean
}

type HirerJoinedProfile = {
  full_name: string | null
  avatar_url: string | null
  city: string | null
}

function joinedProfileOne(
  raw: HirerJoinedProfile | HirerJoinedProfile[] | null | undefined,
): HirerJoinedProfile | null {
  if (raw == null) return null
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

export async function fetchHirerPublic(id: string): Promise<HirerPublicData> {
  if (!UUID_RE.test(id)) {
    return {
      hirer: null,
      openJobs: [],
      hirerReviews: [],
      documentTitle: "დამქირავებლის პროფილი — გიგორი",
      invalidId: true,
    }
  }

  if (!isSupabaseConfigured || !supabase) {
    return {
      hirer: {
        id,
        ownerUserId: "",
        companyName: "TechStart Georgia (დემო)",
        industry: "ტექნოლოგია",
        description: "Supabase რეჟიმში დაინახულეს დემო ტექსტი სრული პროფილისთვის.",
        websiteUrl: null,
        jobsPosted: 3,
        completedJobs: 8,
        contactName: "ლაშა რობაქიძე",
        avatarUrl: null,
        city: "თბილისი",
      },
      openJobs: [
        {
          id: "demo-job",
          title: "React Developer — კონტრაქტი",
          budgetMin: 800,
          budgetMax: 1200,
          budgetType: "fixed",
          vacancies: 2,
          acceptedCount: 1,
        },
      ],
      hirerReviews: [],
      documentTitle: "TechStart Georgia (დემო) — გიგორი",
    }
  }

  const { data: row, error: hErr } = await supabase
    .from("hirer_profiles")
    .select(
      `
            id,
            user_id,
            company_name,
            description,
            industry,
            website_url,
            jobs_posted_count,
            completed_jobs_count,
            profiles:profiles!hirer_profiles_user_id_fkey (
              full_name,
              avatar_url,
              city
            )
          `,
    )
    .eq("id", id)
    .maybeSingle()

  if (hErr) throw hErr
  if (!row) {
    return {
      hirer: null,
      openJobs: [],
      hirerReviews: [],
      documentTitle: "დამქირავებელი არ იძებნება — გიგორი",
    }
  }

  const profile = joinedProfileOne(row.profiles as HirerJoinedProfile | HirerJoinedProfile[] | null | undefined)
  const company = row.company_name?.trim() || "დამქირავებელი"
  const ownerUserId = String(row.user_id ?? "")

  const [
    { data: jobRows, error: jErr },
    { count: completedCount, error: cjErr },
    { count: listingCompletedCount, error: listingCompletedErr },
    { data: reviewRows, error: revErr },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, budget_min, budget_max, budget_type, vacancies, accepted_count")
      .eq("hirer_profile_id", id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("completed_jobs").select("id", { count: "exact", head: true }).eq("hirer_profile_id", id),
    supabase
      .from("service_inquiries")
      .select("id", { count: "exact", head: true })
      .eq("hirer_profile_id", id)
      .eq("status", "completed"),
    supabase
      .from("reviews")
      .select("id, reviewer_id, review_text, rating_overall, created_at")
      .eq("reviewee_id", ownerUserId)
      .order("created_at", { ascending: false })
      .limit(100),
  ])

  if (jErr) throw jErr
  if (cjErr && import.meta.env.DEV) {
    console.warn("[HirerPublic] completed_jobs count:", cjErr.message)
  }
  if (listingCompletedErr && import.meta.env.DEV) {
    console.warn("[HirerPublic] service_inquiries completed count:", listingCompletedErr.message)
  }

  const jobCompleted = typeof completedCount === "number" ? completedCount : Number(row.completed_jobs_count ?? 0)
  const listingDone = typeof listingCompletedCount === "number" && !listingCompletedErr ? listingCompletedCount : 0
  const completedJobsLive = (cjErr ? Number(row.completed_jobs_count ?? 0) : jobCompleted) + listingDone

  const hirer: HirerLoaded = {
    id: row.id,
    ownerUserId,
    companyName: company,
    industry: row.industry ?? null,
    description: row.description ?? null,
    websiteUrl: row.website_url ?? null,
    jobsPosted: Number(row.jobs_posted_count ?? 0),
    completedJobs: completedJobsLive,
    contactName: profile?.full_name?.trim() || "საკონტაქტო პირი",
    avatarUrl: profile?.avatar_url ?? null,
    city: profile?.city ?? null,
  }

  const openJobs: OpenJobBrief[] = (jobRows ?? []).map((j: Record<string, unknown>) => {
    const vs = jobVacancyStats(j.vacancies as number | null | undefined, j.accepted_count as number | null | undefined)
    return {
      id: String(j.id ?? ""),
      title: String(j.title ?? ""),
      budgetMin: j.budget_min != null ? Number(j.budget_min) : null,
      budgetMax: j.budget_max != null ? Number(j.budget_max) : null,
      budgetType: String(j.budget_type ?? "fixed"),
      vacancies: vs.vacancies,
      acceptedCount: vs.acceptedCount,
    }
  })

  let hirerReviews: HirerReviewDisplay[] = []
  if (revErr) {
    if (import.meta.env.DEV) console.warn("[HirerPublic] reviews:", revErr.message)
  } else {
    const rawReviews = (reviewRows ?? []) as Array<{
      id: string
      reviewer_id: string
      review_text: string
      rating_overall: number
      created_at: string
    }>
    const reviewerIds = Array.from(new Set(rawReviews.map((r) => r.reviewer_id)))
    let reviewerMap: Record<string, string> = {}
    if (reviewerIds.length > 0) {
      const { data: reviewersData, error: reviewersError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", reviewerIds)
      if (!reviewersError && reviewersData) {
        reviewerMap = reviewersData.reduce<Record<string, string>>((acc, p) => {
          acc[p.id] = p.full_name
          return acc
        }, {})
      }
    }
    hirerReviews = rawReviews.map((r) => ({
      ...r,
      reviewer_name: reviewerMap[r.reviewer_id] ?? "ფრილანსერი",
    }))
  }

  void recordProfileVisit({
    kind: "hirer",
    hirerProfileId: row.id,
    profileOwnerUserId: String(row.user_id ?? ""),
  })

  return {
    hirer,
    openJobs,
    hirerReviews,
    documentTitle: `${company} — გიგორი`,
  }
}

export { UUID_RE }
