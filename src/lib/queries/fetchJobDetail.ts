import { jobVacancyStats } from "../jobVacancies.ts"
import { jobVipIsActive } from "../vipStatus.ts"
import { isSupabaseConfigured, supabase } from "../supabase.ts"

export type JobData = {
  id: string
  title: string
  titleEn: string | null
  description: string
  descriptionEn: string | null
  status: string
  vacancies: number
  accepted_count: number
  created_at: string
  views_count: number
  is_urgent: boolean
  budget_type: string
  budget_min: number | null
  budget_max: number | null
  duration_type: string
  location_type: string
  application_deadline: string | null
  category_name_ka: string
  category_name_en: string | null
  subcategory_name_ka: string | null
  subcategory_name_en: string | null
  skills: Array<{ id: string; name: string }>
  image_urls: string[]
  hirer_profile_id: string
  hirer_company_name: string
  hirer_jobs_posted_count: number
  hirer_user_id: string
  hirer_full_name: string
  hirer_avatar_url: string | null
  hirer_city: string | null
  hirer_member_since: string
  hirer_email: string
  hirer_phone: string | null
  contact_preference: string
  is_vip: boolean
  vip_tier: string | null
  vip_expires_at: string | null
  vipActive: boolean
}

export type OtherJob = { id: string; title: string; budget_min: number | null; budget_max: number | null; budget_type: string }

export type HirerContact = { email: string; phone: string | null }

export type JobDetailQueryResult = {
  job: JobData | null
  otherJobs: OtherJob[]
  authedUserType: "freelancer" | "hirer" | "guest"
  freelancerProfileId: string | null
  alreadyApplied: boolean
  jobApplicationId: string | null
  viewerUserId: string | null
  hirerContact: HirerContact | null
}

/** PostgREST + RLS sometimes yields null, []; normalize to one row or null before reading fields. */
function normalizeSingleRelation<T extends Record<string, unknown>>(embedded: unknown): T | null {
  if (embedded == null) return null
  if (Array.isArray(embedded)) {
    const first = embedded[0]
    return first != null && typeof first === "object" ? (first as T) : null
  }
  if (typeof embedded === "object") return embedded as T
  return null
}

async function loadHirerContact(jobId: string): Promise<HirerContact | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc("get_job_hirer_contact_for_applicant", { p_job_id: jobId })
  if (error || !data || !Array.isArray(data) || data.length === 0) return null
  const row = data[0] as { email?: string | null; phone?: string | null }
  const email = typeof row.email === "string" ? row.email : ""
  const phone = row.phone != null ? String(row.phone) : null
  if (!email && !phone) return null
  return { email, phone }
}

export async function fetchJobDetail(id: string): Promise<JobDetailQueryResult> {
  const empty: JobDetailQueryResult = {
    job: null,
    otherJobs: [],
    authedUserType: "guest",
    freelancerProfileId: null,
    alreadyApplied: false,
    jobApplicationId: null,
    viewerUserId: null,
    hirerContact: null,
  }

  if (!id) throw new Error("სამუშაო ვერ მოიძებნა")
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase არ არის კონფიგურირებული.")

  const { data: jobRow, error: jobError } = await supabase
    .from("jobs")
    .select(`
            id,
            title,
            title_en,
            description,
            description_en,
            status,
            vacancies,
            accepted_count,
            created_at,
            views_count,
            is_urgent,
            budget_type,
            budget_min,
            budget_max,
            duration_type,
            location_type,
            application_deadline,
            image_urls,
            contact_preference,
            is_vip,
            vip_tier,
            vip_expires_at,
            hirer_profile_id,
            subcategory_id,
            categories (name_ka, name_en),
            subcategories (name_ka, name_en),
            hirer_profiles (
              id,
              user_id,
              company_name,
              jobs_posted_count,
              profiles:profiles!hirer_profiles_user_id_fkey (full_name, avatar_url, city, member_since)
            ),
            job_skills (
              skills (id, name)
            )
          `)
    .eq("id", id)
    .maybeSingle()

  let rowUnknown: Record<string, unknown> | null = null
  if (jobRow == null || jobRow === undefined) {
    rowUnknown = null
  } else if (Array.isArray(jobRow)) {
    const first = jobRow[0]
    rowUnknown = first != null && typeof first === "object" && !Array.isArray(first) ? (first as Record<string, unknown>) : null
  } else if (typeof jobRow === "object") {
    rowUnknown = jobRow as Record<string, unknown>
  }

  if (jobError || rowUnknown == null || typeof rowUnknown.id !== "string") {
    return empty
  }

  const hirerProfilesRaw = normalizeSingleRelation<Record<string, unknown>>(
    (jobRow as { hirer_profiles?: unknown }).hirer_profiles ?? rowUnknown.hirer_profiles,
  )
  const hirerP =
    hirerProfilesRaw?.profiles !== undefined && hirerProfilesRaw.profiles !== null
      ? normalizeSingleRelation<Record<string, unknown>>(hirerProfilesRaw.profiles)
      : null

  const jobSkillsUnknown = rowUnknown.job_skills
  const jobSkillsRows = Array.isArray(jobSkillsUnknown) ? jobSkillsUnknown : []

  const hirerProfileIdSafe = hirerProfilesRaw && typeof hirerProfilesRaw.id === "string" ? hirerProfilesRaw.id : ""
  const hirerUserIdSafe = hirerProfilesRaw && typeof hirerProfilesRaw.user_id === "string" ? hirerProfilesRaw.user_id : ""

  const vacStats = jobVacancyStats(rowUnknown.vacancies as number | null | undefined, rowUnknown.accepted_count as number | null | undefined)

  const mappedJob: JobData = {
    id: String(rowUnknown.id),
    title: String(rowUnknown.title ?? ""),
    titleEn: (rowUnknown.title_en as string | null | undefined)?.trim() || null,
    description: String(rowUnknown.description ?? ""),
    descriptionEn: (rowUnknown.description_en as string | null | undefined)?.trim() || null,
    status: String(rowUnknown.status ?? "open"),
    vacancies: vacStats.vacancies,
    accepted_count: vacStats.acceptedCount,
    created_at: String(rowUnknown.created_at ?? ""),
    views_count: Number(rowUnknown.views_count ?? 0),
    is_urgent: Boolean(rowUnknown.is_urgent),
    budget_type: String(rowUnknown.budget_type ?? ""),
    budget_min: rowUnknown.budget_min === null || rowUnknown.budget_min === undefined ? null : Number(rowUnknown.budget_min),
    budget_max: rowUnknown.budget_max === null || rowUnknown.budget_max === undefined ? null : Number(rowUnknown.budget_max),
    duration_type: String(rowUnknown.duration_type ?? ""),
    location_type: String(rowUnknown.location_type ?? ""),
    application_deadline:
      rowUnknown.application_deadline === null || rowUnknown.application_deadline === undefined
        ? null
        : String(rowUnknown.application_deadline),
    category_name_ka:
      normalizeSingleRelation<{ name_ka?: string }>(rowUnknown.categories)?.name_ka?.trim() || "კატეგორია",
    category_name_en:
      normalizeSingleRelation<{ name_en?: string | null }>(rowUnknown.categories)?.name_en?.trim() || null,
    subcategory_name_ka:
      normalizeSingleRelation<{ name_ka?: string }>(rowUnknown.subcategories)?.name_ka?.trim() ?? null,
    subcategory_name_en:
      normalizeSingleRelation<{ name_en?: string | null }>(rowUnknown.subcategories)?.name_en?.trim() ?? null,
    skills: jobSkillsRows
      .map((item) => normalizeSingleRelation<{ id?: unknown; name?: unknown }>((item as { skills?: unknown }).skills ?? null))
      .filter(
        (s): s is { id: string; name: string } =>
          s != null && typeof s.id === "string" && s.id.length > 0 && typeof s.name === "string" && s.name.length > 0,
      )
      .map((skill) => ({ id: skill.id, name: skill.name })),
    image_urls: Array.isArray(rowUnknown.image_urls)
      ? (rowUnknown.image_urls as unknown[]).map((x) => String(x)).filter(Boolean).slice(0, 3)
      : [],
    hirer_profile_id: hirerProfileIdSafe,
    hirer_company_name:
      (typeof hirerProfilesRaw?.company_name === "string" && hirerProfilesRaw.company_name.trim()
        ? hirerProfilesRaw.company_name
        : null) ||
      (typeof hirerP?.full_name === "string" && hirerP.full_name.trim() ? hirerP.full_name : null) ||
      "დამქირავებელი",
    hirer_jobs_posted_count: Number(hirerProfilesRaw?.jobs_posted_count ?? 0),
    hirer_user_id: hirerUserIdSafe,
    hirer_full_name: (typeof hirerP?.full_name === "string" && hirerP.full_name.trim() ? hirerP.full_name : "") || "დამქირავებელი",
    hirer_avatar_url: hirerP?.avatar_url != null ? String(hirerP.avatar_url) : null,
    hirer_city: hirerP?.city != null ? String(hirerP.city) : null,
    hirer_member_since: hirerP?.member_since != null ? String(hirerP.member_since) : new Date().toISOString(),
    hirer_email: "",
    hirer_phone: null,
    contact_preference: String(rowUnknown.contact_preference ?? ""),
    is_vip: Boolean(rowUnknown.is_vip),
    vip_tier: rowUnknown.vip_tier != null ? String(rowUnknown.vip_tier) : null,
    vip_expires_at: rowUnknown.vip_expires_at != null ? String(rowUnknown.vip_expires_at) : null,
    vipActive: jobVipIsActive(
      Boolean(rowUnknown.is_vip),
      rowUnknown.vip_expires_at != null ? String(rowUnknown.vip_expires_at) : null,
    ),
  }

  if (!mappedJob.hirer_profile_id) {
    return empty
  }

  const { data: others, error: othersError } = await supabase
    .from("jobs")
    .select("id,title,budget_min,budget_max,budget_type")
    .eq("hirer_profile_id", mappedJob.hirer_profile_id)
    .eq("status", "open")
    .neq("id", mappedJob.id)
    .order("created_at", { ascending: false })
    .limit(3)
  if (othersError) throw othersError

  const result: JobDetailQueryResult = {
    job: mappedJob,
    otherJobs: (others ?? []) as OtherJob[],
    authedUserType: "guest",
    freelancerProfileId: null,
    alreadyApplied: false,
    jobApplicationId: null,
    viewerUserId: null,
    hirerContact: null,
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return result
  }
  result.viewerUserId = user.id

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,user_type")
    .eq("id", user.id)
    .maybeSingle()
  if (profileError || !profile) {
    result.viewerUserId = null
    return result
  }

  if (profile.user_type === "freelancer") {
    result.authedUserType = "freelancer"
    const { data: fp, error: fpError } = await supabase.from("freelancer_profiles").select("id").eq("user_id", user.id).maybeSingle()
    if (!fpError && fp) {
      result.freelancerProfileId = fp.id
      const { data: applied, error: appliedError } = await supabase
        .from("job_applications")
        .select("id")
        .eq("job_id", mappedJob.id)
        .eq("freelancer_profile_id", fp.id)
        .maybeSingle()
      if (!appliedError && applied) {
        result.alreadyApplied = true
        result.jobApplicationId = applied.id
        result.hirerContact = await loadHirerContact(mappedJob.id)
      }
    }
  } else if (profile.user_type === "hirer") {
    result.authedUserType = "hirer"
    if (user.id === mappedJob.hirer_user_id) {
      result.hirerContact = await loadHirerContact(mappedJob.id)
    }
  }

  return result
}

export { loadHirerContact }
