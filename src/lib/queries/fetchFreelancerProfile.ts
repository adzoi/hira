import { listingPriceNegotiable } from "../homeFeed.ts"
import { parseListingPreview } from "../listingDescription.ts"
import { normalizeListingPriceType } from "../listingPrice.ts"
import { recordProfileVisit } from "../profileVisits.ts"
import { supabaseEdgeHeaders } from "../supabaseEdgeHeaders.ts"
import { isSupabaseConfigured, supabase } from "../supabase.ts"

export type ProfileData = {
  id: string
  full_name: string
  avatar_url: string | null
  city: string | null
  member_since: string
  email: string | null
  phone: string | null
  cv_url: string | null
}

export type FreelancerData = {
  id: string
  slug: string
  professional_title: string | null
  average_rating: number
  total_reviews_count: number
  availability: string | null
  languages: string[]
  linkedin_url: string | null
  github_url: string | null
  portfolio_url: string | null
  facebook_url: string | null
  instagram_url: string | null
  tiktok_url: string | null
  youtube_url: string | null
  x_url: string | null
  bio: string | null
  user_id: string
  is_accepting_new_work?: boolean | null
  show_completed_work_on_public_profile?: boolean
}

export type SkillData = { id: string; name: string }
export type ServiceData = {
  id: string
  title: string
  titleEn: string | null
  description: string | null
  descriptionEn: string | null
  price: number
  price_type: string
  views_count: number
  tags: string[]
  negotiable: boolean
}
export type ExperienceData = {
  id: string
  title: string
  organization: string
  start_date: string
  end_date: string | null
  description: string | null
}
export type EducationData = {
  id: string
  institution: string
  degree_level: string
  field_of_study: string | null
  end_date: string | null
}
export type PortfolioData = { id: string; title: string; image_url: string; project_url: string | null }

export type PublicCompletedPlatformJob = {
  completedJobId: string
  jobDescription: string
  hirerDisplayName: string
  hirerAvatarUrl: string | null
}

export type ReviewData = {
  id: string
  reviewer_id: string
  review_text: string
  rating_overall: number
  created_at: string
  reviewer_name: string
}

export type FreelancerProfileData = {
  profile: ProfileData
  freelancer: FreelancerData
  skills: SkillData[]
  services: ServiceData[]
  reviews: ReviewData[]
  experience: ExperienceData[]
  education: EducationData[]
  portfolioItems: PortfolioData[]
  publicCompletedJobs: PublicCompletedPlatformJob[]
  publicCompletedListings: { title: string; completedAt: string }[]
  viewerIsOwner: boolean
  publicCvSlug: string | null
}

function embedCjJoin<T extends Record<string, unknown>>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] as T | undefined) ?? null : v
}

function mapPublicCompletedJobRows(rows: unknown[] | null | undefined): PublicCompletedPlatformJob[] {
  if (!rows?.length) return []
  const out: PublicCompletedPlatformJob[] = []
  for (const raw of rows as Array<Record<string, unknown>>) {
    const job = embedCjJoin(raw.jobs as Record<string, unknown> | Record<string, unknown>[] | null)
    const hp = embedCjJoin(raw.hirer_profiles as Record<string, unknown> | Record<string, unknown>[] | null)
    const completedAt = raw.completed_at != null ? String(raw.completed_at) : ""
    if (!completedAt) continue
    const completedJobId = typeof raw.id === "string" ? raw.id : ""
    if (!completedJobId) continue

    const descRaw = job?.description != null ? String(job.description) : ""
    const titleFallback = typeof job?.title === "string" && job.title.trim() ? job.title.trim() : ""
    const jobDescription = descRaw.trim() || titleFallback || "აღწერა არ არის."

    const profiles = hp ? embedCjJoin(hp.profiles as Record<string, unknown> | Record<string, unknown>[] | null) : null
    const company = typeof hp?.company_name === "string" ? hp.company_name.trim() : ""
    const profileName = typeof profiles?.full_name === "string" ? String(profiles.full_name).trim() : ""
    const hirerDisplayName = company || profileName || "დამქირავებელი"
    const hirerAvatarUrl =
      profiles?.avatar_url != null && String(profiles.avatar_url).trim()
        ? String(profiles.avatar_url).trim()
        : null

    out.push({
      completedJobId,
      jobDescription,
      hirerDisplayName,
      hirerAvatarUrl,
    })
  }
  return out
}

export async function fetchFreelancerProfile(slug: string): Promise<FreelancerProfileData> {
  if (!slug) {
    throw new Error("ფრილანსერი ვერ მოიძებნა.")
  }

  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase არ არის კონფიგურირებული.")
  }

  const client = supabase

  const { data: freelancerData, error: freelancerError } = await client
    .from("freelancer_profiles")
    .select("*")
    .eq("slug", slug)
    .eq("is_public", true)
    .single()

  if (freelancerError || !freelancerData) {
    throw new Error("ფრილანსერი ვერ მოიძებნა.")
  }

  const freelancer = freelancerData as FreelancerData

  const {
    data: { session },
  } = await client.auth.getSession()
  const isOwnerViewer = session?.user?.id === freelancerData.user_id

  let publicCvSlug: string | null = null
  try {
    const cvRes = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cv-get?user_id=${encodeURIComponent(freelancerData.user_id)}`,
      {
        method: "GET",
        headers: supabaseEdgeHeaders(session?.access_token ?? null),
      },
    )
    if (cvRes.ok) {
      const cvPayload = await cvRes.json().catch(() => null)
      const cv = cvPayload?.cv
      const slugValue =
        cv &&
        typeof cv === "object" &&
        cv.is_visible_on_profile === true &&
        cv.is_public === true &&
        typeof cv.custom_slug === "string" &&
        cv.custom_slug.trim()
          ? cv.custom_slug.trim()
          : ""
      publicCvSlug = slugValue || null
    }
  } catch {
    publicCvSlug = null
  }

  const profileSelectPublic = "id,full_name,avatar_url,city,member_since,cv_url"

  const [
    profileRes,
    freelancerProfileSkillsRes,
    servicesRes,
    reviewsRes,
    experienceRes,
    educationRes,
    portfolioRes,
    completedJobsRes,
    listingsRpcRes,
  ] = await Promise.all([
    client.from("profiles").select(profileSelectPublic).eq("id", freelancerData.user_id).single(),
    client
      .from("freelancer_profiles")
      .select(
        `
              freelancer_skills (
                skill_id,
                skills ( id, name )
              )
            `,
      )
      .eq("id", freelancerData.id)
      .eq("is_public", true)
      .maybeSingle(),
    client
      .from("services")
      .select("id,title,title_en,description,description_en,price,price_type,views_count")
      .eq("freelancer_profile_id", freelancerData.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    client
      .from("reviews")
      .select("id,reviewer_id,review_text,rating_overall,created_at")
      .eq("reviewee_id", freelancerData.user_id)
      .order("created_at", { ascending: false })
      .limit(10),
    client
      .from("experience")
      .select("id,title,organization,start_date,end_date,description")
      .eq("freelancer_profile_id", freelancerData.id)
      .order("start_date", { ascending: false }),
    client
      .from("freelancer_education")
      .select("id,institution,degree_level,field_of_study,end_date")
      .eq("freelancer_profile_id", freelancerData.id)
      .order("end_date", { ascending: false }),
    client
      .from("portfolio_items")
      .select("id,title,image_url,project_url")
      .eq("freelancer_profile_id", freelancerData.id)
      .order("sort_order", { ascending: true }),
    client
      .from("completed_jobs")
      .select(
        `
              id,
              completed_at,
              job_id,
              jobs ( title, description ),
              hirer_profiles (
                company_name,
                profiles:profiles!hirer_profiles_user_id_fkey ( full_name, avatar_url )
              )
            `,
      )
      .eq("freelancer_profile_id", freelancerData.id)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(40),
    client.rpc("public_freelancer_completed_service_titles", {
      p_freelancer_profile_id: freelancerData.id,
    }),
  ])

  if (profileRes.error) throw profileRes.error
  if (freelancerProfileSkillsRes.error) throw freelancerProfileSkillsRes.error
  if (servicesRes.error) throw servicesRes.error
  if (reviewsRes.error) throw reviewsRes.error
  if (experienceRes.error) throw experienceRes.error
  if (educationRes.error) throw educationRes.error
  if (portfolioRes.error) throw portfolioRes.error

  let publicCompletedJobs: PublicCompletedPlatformJob[] = []
  if (completedJobsRes.error) {
    if (import.meta.env.DEV) console.warn("[FreelancerProfile] completed_jobs:", completedJobsRes.error.message)
  } else {
    publicCompletedJobs = mapPublicCompletedJobRows(completedJobsRes.data as unknown[])
  }

  let publicCompletedListings: { title: string; completedAt: string }[] = []
  if (listingsRpcRes.error) {
    if (import.meta.env.DEV)
      console.warn("[FreelancerProfile] completed listing titles RPC:", listingsRpcRes.error.message)
  } else {
    const rpcRows = (listingsRpcRes.data ?? []) as { service_title: string; completed_at: string }[]
    publicCompletedListings = rpcRows.map((row) => ({
      title: row.service_title,
      completedAt: row.completed_at,
    }))
  }

  const hideCompletedPublic = freelancer.show_completed_work_on_public_profile === false
  if (hideCompletedPublic && !isOwnerViewer) {
    publicCompletedJobs = []
    publicCompletedListings = []
  }

  const base = profileRes.data as Omit<ProfileData, "phone" | "email"> & Partial<Pick<ProfileData, "phone" | "email">>
  const profile: ProfileData = {
    ...base,
    email: null,
    phone: null,
  }

  const services: ServiceData[] = (
    (servicesRes.data ?? []) as Array<
      Omit<ServiceData, "tags" | "views_count" | "negotiable" | "titleEn" | "descriptionEn"> & {
        title_en?: string | null
        description_en?: string | null
        views_count?: number | null
      }
    >
  ).map((service) => {
    const rawDesc = String(service.description ?? "")
    const parsed = parseListingPreview(service.description ?? null)
    return {
      id: service.id,
      title: service.title,
      titleEn: service.title_en?.trim() || null,
      description: parsed.text.trim() ? parsed.text : null,
      descriptionEn: service.description_en?.trim() || null,
      price: service.price,
      price_type: normalizeListingPriceType(service.price_type),
      views_count: Number(service.views_count ?? 0),
      tags: parsed.tags,
      negotiable: listingPriceNegotiable(service.price, rawDesc),
    }
  })

  const experience = (experienceRes.data ?? []) as ExperienceData[]
  const education = (educationRes.data ?? []) as EducationData[]
  const portfolioItems = (portfolioRes.data ?? []) as PortfolioData[]

  type SkillCell = { id: string; name: string }
  type FsRowRaw = { skill_id?: string | null; skills?: SkillCell | SkillCell[] | null }

  function firstSkill(skillCell: FsRowRaw["skills"]): SkillCell | null {
    if (!skillCell) return null
    return Array.isArray(skillCell) ? skillCell[0] ?? null : skillCell
  }

  const fpSkillPayload = freelancerProfileSkillsRes.data as { freelancer_skills?: FsRowRaw[] | null } | null
  const fsRowsRaw = fpSkillPayload?.freelancer_skills ?? []

  const skillById = new Map<string, { id: string; name: string }>()
  const idsNeedingName: string[] = []
  for (const row of fsRowsRaw) {
    const embedded = firstSkill(row.skills)
    if (embedded?.id && embedded?.name) {
      skillById.set(embedded.id, { id: embedded.id, name: embedded.name })
      continue
    }
    const sid = row.skill_id ?? embedded?.id
    if (sid && !skillById.has(sid)) idsNeedingName.push(sid)
  }
  const uniqueMissing = [...new Set(idsNeedingName)]
  async function hydrateSkills(ids: string[]) {
    const uniq = [...new Set(ids.filter(Boolean))]
    if (uniq.length === 0 || !client) return
    const { data: skillRowsExtra, error: skillRowsExtraErr } = await client
      .from("skills")
      .select("id,name")
      .in("id", uniq)
      .eq("is_approved", true)
    if (skillRowsExtraErr) throw skillRowsExtraErr
    for (const s of skillRowsExtra ?? []) {
      if (s.id && s.name) skillById.set(s.id, { id: s.id, name: s.name })
    }
  }

  if (uniqueMissing.length > 0) await hydrateSkills(uniqueMissing)

  if (skillById.size === 0) {
    const { data: rawFs, error: rawFsErr } = await client
      .from("freelancer_skills")
      .select("skill_id")
      .eq("freelancer_profile_id", freelancerData.id)
    if (!rawFsErr && rawFs?.length) {
      await hydrateSkills(rawFs.map((r) => String(r.skill_id ?? "")))
    }
  }

  const skills = [...skillById.values()]

  const reviewRows = (reviewsRes.data ?? []) as Array<{
    id: string
    reviewer_id: string
    review_text: string
    rating_overall: number
    created_at: string
  }>
  const reviewRatings = reviewRows.map((r) => Number(r.rating_overall)).filter((n) => Number.isFinite(n))
  let updatedFreelancer = freelancer
  if (reviewRatings.length > 0) {
    const avg = reviewRatings.reduce((sum, n) => sum + n, 0) / reviewRatings.length
    updatedFreelancer = {
      ...freelancer,
      average_rating: avg,
      total_reviews_count: Math.max(freelancer.total_reviews_count ?? 0, reviewRows.length),
    }
  }

  const reviewerIds = Array.from(new Set(reviewRows.map((review) => review.reviewer_id)))

  let reviewerMap: Record<string, string> = {}
  if (reviewerIds.length > 0) {
    const { data: reviewersData, error: reviewersError } = await client
      .from("profiles")
      .select("id,full_name")
      .in("id", reviewerIds)
    if (reviewersError) throw reviewersError
    reviewerMap =
      reviewersData?.reduce<Record<string, string>>((acc, row) => {
        acc[row.id] = row.full_name
        return acc
      }, {}) ?? {}
  }

  const reviews: ReviewData[] = reviewRows.map((review) => ({
    ...review,
    reviewer_name: reviewerMap[review.reviewer_id] ?? "მომხმარებელი",
  }))

  void recordProfileVisit({
    kind: "freelancer",
    freelancerProfileId: freelancerData.id,
    profileOwnerUserId: freelancerData.user_id,
  })

  return {
    profile,
    freelancer: updatedFreelancer,
    skills,
    services,
    reviews,
    experience,
    education,
    portfolioItems,
    publicCompletedJobs,
    publicCompletedListings,
    viewerIsOwner: isOwnerViewer,
    publicCvSlug,
  }
}
