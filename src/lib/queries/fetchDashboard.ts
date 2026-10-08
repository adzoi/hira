import type { NavigateFunction } from "react-router-dom"
import { countFollowers, countFollowing } from "../follows.ts"
import { META_SUFFIX, resolveListingMetaPrefix, stripLegacyPricePrefix } from "../listingDescription.ts"
import { normalizeListingPriceType } from "../listingPrice.ts"
import { countFreelancerProfileVisits } from "../profileVisits.ts"
import { isSupabaseConfigured, supabase } from "../supabase.ts"
import type { Database } from "../database.types.ts"

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
type FreelancerProfileRow = Database["public"]["Tables"]["freelancer_profiles"]["Row"]
type HirerProfileRow = Database["public"]["Tables"]["hirer_profiles"]["Row"]
type JobRow = Database["public"]["Tables"]["jobs"]["Row"]
type JobApplicationRow = Database["public"]["Tables"]["job_applications"]["Row"]

type CancelRequestedByRole = "hirer" | "freelancer" | null

type DashboardFreelancerInquiry = {
  id: string
  createdAt: string
  message: string
  proposedBudget: number | null
  status: string
  completedAt: string | null
  listingTitle: string
  hirerLabel: string
  hirerProfileId: string | null
  hirerUserId: string | null
  serviceId: string | null
  cancelRequestedBy: CancelRequestedByRole
}

type DashboardHirerInquiry = {
  id: string
  createdAt: string
  message: string
  proposedBudget: number | null
  status: string
  completedAt: string | null
  listingTitle: string
  freelancerName: string
  freelancerSlug: string | null
  freelancerUserId: string | null
  cancelRequestedBy: CancelRequestedByRole
}

type FreelancerPendingJobOffer = {
  applicationId: string
  jobId: string
  jobTitle: string
  hirerLabel: string
  hirerUserId: string | null
  createdAt: string
  status: string
  cancelRequestedBy: CancelRequestedByRole
}

type HirerApplicationRow = {
  applicationId: string
  jobId: string
  jobTitle: string
  jobStatus: string
  freelancerProfileId: string
  freelancerUserId: string
  freelancerName: string
  freelancerSlug: string | null
  createdAt: string
  status: string
  cancelRequestedBy: CancelRequestedByRole
}

type ServiceDraft = {
  id?: string
  title: string
  description: string
  price: string
  priceType: "fixed" | "hourly" | "monthly"
  isActive: boolean
  /** Saved posts only: VIP expiry when the service is VIP. */
  vipExpiresAt?: string | null
}

type FreelancerHirerReviewRow = {
  completedJobId: string
  jobId: string
  jobTitle: string
  hirerUserId: string
  hirerDisplayName: string
}

type FreelancerCompletedPlatformJob = {
  completedJobId: string
  jobTitle: string
  completedAt: string
  jobDescription: string
  hirerDisplayName: string
  hirerAvatarUrl: string | null
}

function embedJoinRow<T extends Record<string, unknown>>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] as T | undefined) ?? null : v
}

function mapServiceInquiryRowsForFreelancer(rows: unknown[] | null | undefined): DashboardFreelancerInquiry[] {
  if (!rows?.length) return []
  const out: DashboardFreelancerInquiry[] = []
  for (const row of rows as Array<Record<string, unknown>>) {
    const svc = embedJoinRow(row.services as Record<string, unknown> | Record<string, unknown>[] | null)
    const hp = embedJoinRow(row.hirer_profiles as Record<string, unknown> | Record<string, unknown>[] | null)
    out.push({
      id: String(row.id),
      createdAt: String(row.created_at ?? ""),
      message: String(row.message ?? ""),
      proposedBudget: row.proposed_budget != null ? Number(row.proposed_budget) : null,
      status: String(row.status ?? "pending"),
      completedAt: row.completed_at != null ? String(row.completed_at) : null,
      listingTitle: typeof svc?.title === "string" && svc.title.trim() ? svc.title : "ლისტინგი",
      hirerLabel:
        typeof hp?.company_name === "string" && String(hp.company_name).trim()
          ? String(hp.company_name).trim()
          : "დამქირავებელი",
      hirerProfileId: typeof hp?.id === "string" && hp.id.trim() ? hp.id : null,
      hirerUserId: typeof hp?.user_id === "string" && hp.user_id.trim() ? hp.user_id : null,
      serviceId: typeof svc?.id === "string" && svc.id.trim() ? svc.id : null,
      cancelRequestedBy: (row.cancel_requested_by as CancelRequestedByRole) ?? null,
    })
  }
  return out
}

function mapServiceInquiryRowsForHirer(rows: unknown[] | null | undefined): DashboardHirerInquiry[] {
  if (!rows?.length) return []
  const out: DashboardHirerInquiry[] = []
  for (const row of rows as Array<Record<string, unknown>>) {
    const svc = embedJoinRow(row.services as Record<string, unknown> | Record<string, unknown>[] | null)
    const fp = embedJoinRow(row.freelancer_profiles as Record<string, unknown> | Record<string, unknown>[] | null)
    const prof = embedJoinRow(fp?.profiles as Record<string, unknown> | Record<string, unknown>[] | null)
    const name =
      typeof prof?.full_name === "string" && String(prof.full_name).trim()
        ? String(prof.full_name).trim()
        : "ფრილანსერი"
    out.push({
      id: String(row.id),
      createdAt: String(row.created_at ?? ""),
      message: String(row.message ?? ""),
      proposedBudget: row.proposed_budget != null ? Number(row.proposed_budget) : null,
      status: String(row.status ?? "pending"),
      completedAt: row.completed_at != null ? String(row.completed_at) : null,
      listingTitle: typeof svc?.title === "string" && svc.title.trim() ? svc.title : "ლისტინგი",
      freelancerName: name,
      freelancerSlug: typeof fp?.slug === "string" ? fp.slug : null,
      freelancerUserId: typeof fp?.user_id === "string" && fp.user_id.trim() ? fp.user_id : null,
      cancelRequestedBy: (row.cancel_requested_by as CancelRequestedByRole) ?? null,
    })
  }
  return out
}

function stripListingMeta(raw: string) {
  const metaPrefix = resolveListingMetaPrefix(raw)
  if (!metaPrefix) return stripLegacyPricePrefix(raw)
  const endIndex = raw.indexOf(META_SUFFIX)
  if (endIndex < 0) return stripLegacyPricePrefix(raw)
  return stripLegacyPricePrefix(raw.slice(endIndex + META_SUFFIX.length))
}

function snapshotServices(services: ServiceDraft[]) {
  return JSON.stringify(
    services.map((item) => ({
      id: item.id ?? null,
      title: item.title.trim(),
      description: item.description.trim(),
      price: item.price.trim(),
      priceType: item.priceType,
      isActive: item.isActive,
    })),
  )
}

export function mapFreelancerCompletedPlatformJobRows(rows: unknown[] | null | undefined): FreelancerCompletedPlatformJob[] {
  if (!rows?.length) return []
  const out: FreelancerCompletedPlatformJob[] = []
  for (const raw of rows as Array<Record<string, unknown>>) {
    const job = embedJoinRow(raw.jobs as Record<string, unknown> | Record<string, unknown>[] | null)
    const hp = embedJoinRow(raw.hirer_profiles as Record<string, unknown> | Record<string, unknown>[] | null)
    const completedAt = raw.completed_at != null ? String(raw.completed_at) : ""
    if (!completedAt) continue
    const completedJobId = typeof raw.id === "string" ? raw.id : ""
    if (!completedJobId) continue
    const descRaw = job?.description != null ? String(job.description) : ""
    const titleFallback = typeof job?.title === "string" && job.title.trim() ? job.title.trim() : ""
    const jobDescription = descRaw.trim() || titleFallback || "აღწერა არ არის."
    const profiles = hp ? embedJoinRow(hp.profiles as Record<string, unknown> | Record<string, unknown>[] | null) : null
    const company = typeof hp?.company_name === "string" ? hp.company_name.trim() : ""
    const profileName = typeof profiles?.full_name === "string" ? String(profiles.full_name).trim() : ""
    const hirerDisplayName = company || profileName || "დამქირავებელი"
    const hirerAvatarUrl =
      profiles?.avatar_url != null && String(profiles.avatar_url).trim()
        ? String(profiles.avatar_url).trim()
        : null
    out.push({
      completedJobId,
      jobTitle: titleFallback || "სამუშაო",
      completedAt,
      jobDescription,
      hirerDisplayName,
      hirerAvatarUrl,
    })
  }
  return out
}

async function loadFreelancerHirerReviewQueue(
  client: typeof supabase,
  freelancerProfileId: string,
  profileUserId: string,
): Promise<FreelancerHirerReviewRow[]> {
  if (!client) return []
  const { data: rows, error } = await client
    .from("completed_jobs")
    .select(
      `id, job_id, hirer_profile_id, jobs ( title ), hirer_profiles ( user_id, company_name )`,
    )
    .eq("freelancer_profile_id", freelancerProfileId)
  if (error) throw error
  const cjList = (rows ?? []) as Array<Record<string, unknown>>
  if (cjList.length === 0) return []
  const cjIds = cjList.map((r) => String(r.id))
  const { data: myRevs, error: revErr } = await client
    .from("reviews")
    .select("completed_job_id")
    .eq("reviewer_id", profileUserId)
    .in("completed_job_id", cjIds)
  if (revErr) throw revErr
  const reviewed = new Set((myRevs ?? []).map((r) => r.completed_job_id))
  const out: FreelancerHirerReviewRow[] = []
  for (const row of cjList) {
    if (reviewed.has(String(row.id))) continue
    const job = embedJoinRow(row.jobs as Record<string, unknown> | Record<string, unknown>[] | null)
    const hp = embedJoinRow(row.hirer_profiles as Record<string, unknown> | Record<string, unknown>[] | null)
    const jobTitle = typeof job?.title === "string" && job.title.trim() ? job.title : "სამუშაო"
    const hirerUserId = typeof hp?.user_id === "string" ? hp.user_id : ""
    if (!hirerUserId) continue
    const company = typeof hp?.company_name === "string" ? hp.company_name.trim() : ""
    out.push({
      completedJobId: String(row.id),
      jobId: String(row.job_id ?? ""),
      jobTitle,
      hirerUserId,
      hirerDisplayName: company || "დამქირავებელი",
    })
  }
  return out
}

async function fetchHirerDashboardSection(
  client: typeof supabase,
  hirerProfileId: string,
): Promise<{ myJobs: JobRow[]; applications: HirerApplicationRow[]; counts: Record<string, number> }> {
  if (!client) return { myJobs: [], applications: [], counts: {} }
  const clientAny = client as any
  const { data: myJobsData, error: myJobsError } = await client
    .from("jobs")
    .select("*")
    .eq("hirer_profile_id", hirerProfileId)
    .order("created_at", { ascending: false })
  if (myJobsError) throw myJobsError
  const myJobsList = (myJobsData ?? []) as JobRow[]
  const jobIds = myJobsList.map((j) => j.id)
  const jobStatusById = myJobsList.reduce<Record<string, string>>((acc, j) => {
    acc[j.id] = j.status
    return acc
  }, {})
  const jobTitleById = myJobsList.reduce<Record<string, string>>((acc, j) => {
    acc[j.id] = j.title
    return acc
  }, {})
  if (jobIds.length === 0) return { myJobs: myJobsList, applications: [], counts: {} }
  const { data: applicationsData, error: applicationsError } = await clientAny
    .from("job_applications")
    .select("*")
    .in("job_id", jobIds)
    .eq("deleted_by_hirer", false)
    .eq("deleted_by_freelancer", false)
    .order("created_at", { ascending: false })
    .limit(100)
  if (applicationsError) throw applicationsError
  const apps = (applicationsData ?? []) as JobApplicationRow[]
  const counts = apps.reduce<Record<string, number>>((acc, app) => {
    acc[app.job_id] = (acc[app.job_id] ?? 0) + 1
    return acc
  }, {})
  const fpIds = Array.from(new Set(apps.map((a) => a.freelancer_profile_id)))
  let fpById: Record<string, { user_id: string; slug: string | null }> = {}
  if (fpIds.length > 0) {
    const { data: freelancerProfilesData, error: fProfilesError } = await client
      .from("freelancer_profiles")
      .select("id, user_id, slug")
      .in("id", fpIds)
    if (fProfilesError) throw fProfilesError
    fpById = (freelancerProfilesData ?? []).reduce<Record<string, { user_id: string; slug: string | null }>>((acc, fp) => {
      acc[fp.id] = { user_id: fp.user_id, slug: fp.slug ?? null }
      return acc
    }, {})
  }
  const profileIds = Array.from(new Set(Object.values(fpById).map((fp) => fp.user_id)))
  let profileNameById: Record<string, string> = {}
  if (profileIds.length > 0) {
    const { data: profilesData, error: profilesError } = await client.from("profiles").select("id, full_name").in("id", profileIds)
    if (profilesError) throw profilesError
    profileNameById = (profilesData ?? []).reduce<Record<string, string>>((acc, p) => {
      acc[p.id] = p.full_name
      return acc
    }, {})
  }
  const applications: HirerApplicationRow[] = apps.map((app) => {
    const fp = fpById[app.freelancer_profile_id]
    const freelancerUserId = fp?.user_id ?? ""
    const freelancerName = fp ? profileNameById[fp.user_id] ?? "ფრილანსერი" : "ფრილანსერი"
    const rowExtra = app as JobApplicationRow & { cancel_requested_by?: string | null }
    return {
      applicationId: app.id,
      jobId: app.job_id,
      jobTitle: jobTitleById[app.job_id] ?? "განცხადება",
      jobStatus: jobStatusById[app.job_id] ?? "open",
      freelancerProfileId: app.freelancer_profile_id,
      freelancerUserId,
      freelancerName,
      freelancerSlug: fp?.slug ?? null,
      createdAt: app.created_at,
      status: app.status,
      cancelRequestedBy: (rowExtra.cancel_requested_by as CancelRequestedByRole) ?? null,
    }
  })
  return { myJobs: myJobsList, applications, counts }
}

/** Which of the hirer's job applications they have already reviewed, keyed by application id. */
export async function fetchHirerReviewedApplicationIds(
  client: typeof supabase,
  reviewerProfileId: string,
  applications: HirerApplicationRow[],
): Promise<Record<string, true>> {
  if (!client || !reviewerProfileId || applications.length === 0) return {}
  const jobIds = Array.from(new Set(applications.map((item) => item.jobId).filter(Boolean)))
  if (jobIds.length === 0) return {}
  const { data: completedRows, error: completedErr } = await client
    .from("completed_jobs")
    .select("id, job_id, freelancer_profile_id")
    .in("job_id", jobIds)
  if (completedErr || !completedRows || completedRows.length === 0) return {}
  const completedIds = completedRows.map((row) => row.id)
  const { data: reviewRows, error: reviewErr } = await client
    .from("reviews")
    .select("completed_job_id")
    .eq("reviewer_id", reviewerProfileId)
    .in("completed_job_id", completedIds)
  if (reviewErr || !reviewRows || reviewRows.length === 0) return {}
  const reviewedCompletedIds = new Set(reviewRows.map((row) => String(row.completed_job_id ?? "")).filter(Boolean))
  const reviewedHireKeys = new Set(
    completedRows
      .filter((row) => reviewedCompletedIds.has(String(row.id ?? "")))
      .map((row) => `${row.job_id ?? ""}:${row.freelancer_profile_id ?? ""}`),
  )
  return applications.reduce<Record<string, true>>((acc, item) => {
    if (reviewedHireKeys.has(`${item.jobId}:${item.freelancerProfileId}`)) acc[item.applicationId] = true
    return acc
  }, {})
}

/** Everything the dashboard shows on first paint. Returned (not pushed into component state) so it can be cached. */
export type DashboardSnapshot = {
  profile: ProfileRow
  freelancerProfile: FreelancerProfileRow | null
  hirerProfile: HirerProfileRow | null
  followersCount: number
  followingCount: number
  freelancerListingInquiries: DashboardFreelancerInquiry[]
  freelancerCompletedJobsCount: number
  freelancerHirerReviewQueue: FreelancerHirerReviewRow[]
  freelancerCompletedPlatformJobs: FreelancerCompletedPlatformJob[]
  freelancerPendingJobOffers: FreelancerPendingJobOffer[]
  hirerProfileViewerCount: number
  overallProfileVisitCount: number
  serviceDrafts: ServiceDraft[]
  initialServicesSnapshot: string
  initialServiceIds: string[]
  myJobs: JobRow[]
  hirerApplications: HirerApplicationRow[]
  jobApplicationsByJobId: Record<string, number>
  hirerCompletedJobsCount: number
  hirerListingInquiries: DashboardHirerInquiry[]
  hirerReviewedListingInquiryIds: Record<string, true>
  hirerReviewedJobApplicationIds: Record<string, true>
}

/** Secondary sections: a failure only empties that section instead of failing the whole dashboard. */
async function orFallback<T>(label: string, fallback: T, load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (err) {
    if (import.meta.env.DEV) console.warn(`[dashboard] ${label}:`, err)
    return fallback
  }
}

async function loadFreelancerSections(supabaseAny: any, freelancerData: FreelancerProfileRow, userId: string) {
  const client = supabase!
  const [
    freelancerListingInquiries,
    freelancerHirerReviewQueue,
    freelancerPendingJobOffers,
    freelancerCompletedPlatformJobs,
    freelancerCompletedJobsCount,
    visitCounts,
    services,
  ] = await Promise.all([
    orFallback("service_inquiries load", [] as DashboardFreelancerInquiry[], async () => {
      const { data: inqRows, error: inqLoadErr } = await supabaseAny
        .from("service_inquiries")
        .select(
          `
          id,
          created_at,
          message,
          proposed_budget,
          status,
          cancel_requested_by,
          completed_at,
          services ( id, title ),
          hirer_profiles ( id, company_name, user_id )
        `,
        )
        .eq("freelancer_profile_id", freelancerData.id)
        .eq("deleted_by_hirer", false)
        .eq("deleted_by_freelancer", false)
        .order("created_at", { ascending: false })
        .limit(40)
      if (inqLoadErr) throw inqLoadErr
      return mapServiceInquiryRowsForFreelancer(inqRows as unknown[])
    }),
    orFallback("freelancer hirer review queue", [] as FreelancerHirerReviewRow[], () =>
      loadFreelancerHirerReviewQueue(client, freelancerData.id, userId),
    ),
    orFallback("freelancer pending job offers", [] as FreelancerPendingJobOffer[], async () => {
      const { data: pendingAppsRows, error: pendingAppsErr } = await supabaseAny
        .from("job_applications")
        .select(
          `
          id,
          job_id,
          created_at,
          status,
          cancel_requested_by,
          jobs (
            title,
            hirer_profiles (
              user_id,
              company_name,
              profiles:profiles!hirer_profiles_user_id_fkey ( full_name )
            )
          )
        `,
        )
        .eq("freelancer_profile_id", freelancerData.id)
        .eq("deleted_by_hirer", false)
        .eq("deleted_by_freelancer", false)
        .order("created_at", { ascending: false })
      if (pendingAppsErr) throw pendingAppsErr

      const mappedOffers = ((pendingAppsRows ?? []) as Array<Record<string, unknown>>).map((row) => {
        const job = embedJoinRow(row.jobs as Record<string, unknown> | Record<string, unknown>[] | null)
        const hp = embedJoinRow(job?.hirer_profiles as Record<string, unknown> | Record<string, unknown>[] | null)
        const hpProfile = embedJoinRow(hp?.profiles as Record<string, unknown> | Record<string, unknown>[] | null)
        const companyName = typeof hp?.company_name === "string" ? hp.company_name.trim() : ""
        const fullName = typeof hpProfile?.full_name === "string" ? hpProfile.full_name.trim() : ""
        return {
          applicationId: String(row.id ?? ""),
          jobId: String(row.job_id ?? ""),
          createdAt: String(row.created_at ?? ""),
          jobTitle: typeof job?.title === "string" && job.title.trim() ? job.title : "განცხადება",
          hirerLabel: companyName || fullName || "დამქირავებელი",
          hirerUserId: typeof hp?.user_id === "string" && hp.user_id.trim() ? hp.user_id : null,
          status: String(row.status ?? "pending"),
          cancelRequestedBy: (row.cancel_requested_by as CancelRequestedByRole) ?? null,
        }
      })
      return mappedOffers.filter((item) => item.applicationId)
    }),
    orFallback("completed_jobs list", [] as FreelancerCompletedPlatformJob[], async () => {
      const { data: cjRows, error: cjRowsErr } = await client
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
        .limit(80)
      if (cjRowsErr) throw cjRowsErr
      return mapFreelancerCompletedPlatformJobRows(cjRows as unknown[])
    }),
    orFallback("completed jobs count", Number(freelancerData.completed_jobs_count ?? 0), async () => {
      const [{ count: cjCount, error: cjCountErr }, { count: listingDoneCount, error: listingDoneErr }] =
        await Promise.all([
          client.from("completed_jobs").select("id", { count: "exact", head: true }).eq("freelancer_profile_id", freelancerData.id),
          supabaseAny
            .from("service_inquiries")
            .select("id", { count: "exact", head: true })
            .eq("freelancer_profile_id", freelancerData.id)
            .eq("deleted_by_hirer", false)
            .eq("deleted_by_freelancer", false)
            .eq("status", "completed"),
        ])
      if (cjCountErr && import.meta.env.DEV) {
        console.warn("[dashboard] completed_jobs count:", cjCountErr.message)
      }
      if (listingDoneErr && import.meta.env.DEV) {
        console.warn("[dashboard] service_inquiries completed count:", listingDoneErr.message)
      }
      const jobDone = typeof cjCount === "number" ? cjCount : 0
      const listingDone = typeof listingDoneCount === "number" ? listingDoneCount : 0
      return cjCountErr
        ? Number(freelancerData.completed_jobs_count ?? 0) + (listingDoneErr ? 0 : listingDone)
        : jobDone + (listingDoneErr ? 0 : listingDone)
    }),
    orFallback("profile visit counts", { hirerProfileViewerCount: 0, overallProfileVisitCount: 0 }, async () => {
      const [{ data: hirerVisitorsRpc, error: hirerVisitorsRpcError }, totalVisits] = await Promise.all([
        client.rpc("count_distinct_hirer_visitors_to_freelancer", {
          target_freelancer_profile_id: freelancerData.id,
        }),
        countFreelancerProfileVisits(freelancerData.id),
      ])
      if (hirerVisitorsRpcError && import.meta.env.DEV) {
        console.warn("[dashboard] hirer visitor count RPC:", hirerVisitorsRpcError.message)
      }
      const hv = hirerVisitorsRpc == null ? 0 : Number(hirerVisitorsRpc)
      return {
        hirerProfileViewerCount: Number.isFinite(hv) ? hv : 0,
        overallProfileVisitCount: totalVisits ?? 0,
      }
    }),
    orFallback("services", { drafts: [] as ServiceDraft[], ids: [] as string[] }, async () => {
      const { data: servicesData, error: servicesError } = await client
        .from("services")
        .select("*")
        .eq("freelancer_profile_id", freelancerData.id)
        .order("created_at", { ascending: false })
      if (servicesError) throw servicesError
      const serviceRows = servicesData ?? []
      const drafts: ServiceDraft[] = serviceRows.slice(0, 3).map((item) => ({
        id: item.id,
        title: item.title ?? "",
        description: stripListingMeta(item.description ?? ""),
        price: item.price !== null && item.price !== undefined ? String(item.price) : "",
        priceType: normalizeListingPriceType(item.price_type),
        isActive: item.is_active ?? true,
        vipExpiresAt: item.is_vip ? item.vip_expires_at : null,
      }))
      return { drafts, ids: serviceRows.map((item) => item.id) }
    }),
  ])

  return {
    freelancerListingInquiries,
    freelancerHirerReviewQueue,
    freelancerPendingJobOffers,
    freelancerCompletedPlatformJobs,
    freelancerCompletedJobsCount,
    ...visitCounts,
    serviceDrafts: services.drafts,
    initialServicesSnapshot: snapshotServices(services.drafts),
    initialServiceIds: services.ids,
  }
}

async function loadHirerSections(supabaseAny: any, hirerData: HirerProfileRow, profileId: string) {
  const client = supabase!
  const [section, hirerCompletedJobsCount, inquiries] = await Promise.all([
    fetchHirerDashboardSection(client, hirerData.id),
    orFallback("hirer completed jobs count", Number(hirerData.completed_jobs_count ?? 0), async () => {
      const [{ count: hCjCount, error: hCjErr }, { count: hListingDone, error: hListingDoneErr }] = await Promise.all([
        client.from("completed_jobs").select("id", { count: "exact", head: true }).eq("hirer_profile_id", hirerData.id),
        supabaseAny
          .from("service_inquiries")
          .select("id", { count: "exact", head: true })
          .eq("hirer_profile_id", hirerData.id)
          .eq("deleted_by_hirer", false)
          .eq("deleted_by_freelancer", false)
          .eq("status", "completed"),
      ])
      if (hCjErr && import.meta.env.DEV) {
        console.warn("[dashboard] hirer completed_jobs count:", hCjErr.message)
      }
      if (hListingDoneErr && import.meta.env.DEV) {
        console.warn("[dashboard] hirer service_inquiries completed count:", hListingDoneErr.message)
      }
      const hJobDone = typeof hCjCount === "number" ? hCjCount : 0
      const hListDone = typeof hListingDone === "number" ? hListingDone : 0
      return hCjErr
        ? Number(hirerData.completed_jobs_count ?? 0) + (hListingDoneErr ? 0 : hListDone)
        : hJobDone + (hListingDoneErr ? 0 : hListDone)
    }),
    orFallback(
      "hirer service_inquiries",
      { list: [] as DashboardHirerInquiry[], reviewed: {} as Record<string, true> },
      async () => {
        const { data: hInqRows, error: hInqErr } = await supabaseAny
          .from("service_inquiries")
          .select(
            `
            id,
            created_at,
            message,
            proposed_budget,
            status,
            cancel_requested_by,
            completed_at,
            services ( title ),
            freelancer_profiles (
              user_id,
              slug,
              profiles:profiles!freelancer_profiles_user_id_fkey ( full_name )
            )
          `,
          )
          .eq("hirer_profile_id", hirerData.id)
          .eq("deleted_by_hirer", false)
          .eq("deleted_by_freelancer", false)
          .order("created_at", { ascending: false })
          .limit(40)
        if (hInqErr) throw hInqErr
        const list = mapServiceInquiryRowsForHirer(hInqRows as unknown[])
        const reviewed: Record<string, true> = {}
        if (list.length > 0) {
          const { data: myReviewsRows, error: myReviewsErr } = await client
            .from("reviews")
            .select("service_inquiry_id")
            .eq("reviewer_id", profileId)
            .in(
              "service_inquiry_id",
              list.map((item) => item.id),
            )
          if (!myReviewsErr) {
            for (const row of myReviewsRows ?? []) {
              const inquiryId = String(row.service_inquiry_id ?? "")
              if (inquiryId) reviewed[inquiryId] = true
            }
          }
        }
        return { list, reviewed }
      },
    ),
  ])
  const hirerReviewedJobApplicationIds = await orFallback("hirer reviewed applications", {}, () =>
    fetchHirerReviewedApplicationIds(client, profileId, section.applications),
  )

  return {
    myJobs: section.myJobs,
    hirerApplications: section.applications,
    jobApplicationsByJobId: section.counts,
    hirerCompletedJobsCount,
    hirerListingInquiries: inquiries.list,
    hirerReviewedListingInquiryIds: inquiries.reviewed,
    hirerReviewedJobApplicationIds,
  }
}

/** Loads the signed-in user's dashboard. Resolves to null after redirecting a signed-out visitor to /login. */
export async function fetchDashboard(navigate: NavigateFunction, supabaseAny: any): Promise<DashboardSnapshot | null> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase პარამეტრები ვერ მოიძებნა.")
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    navigate("/login", { replace: true })
    return null
  }

  const { data: profileData, error: profileError } = await supabase.rpc("get_my_profile").single()

  if (profileError || !profileData) {
    throw new Error("პროფილის მონაცემები ვერ ჩაიტვირთა.")
  }

  const snapshot: DashboardSnapshot = {
    profile: profileData,
    freelancerProfile: null,
    hirerProfile: null,
    followersCount: 0,
    followingCount: 0,
    freelancerListingInquiries: [],
    freelancerCompletedJobsCount: 0,
    freelancerHirerReviewQueue: [],
    freelancerCompletedPlatformJobs: [],
    freelancerPendingJobOffers: [],
    hirerProfileViewerCount: 0,
    overallProfileVisitCount: 0,
    serviceDrafts: [],
    initialServicesSnapshot: snapshotServices([]),
    initialServiceIds: [],
    myJobs: [],
    hirerApplications: [],
    jobApplicationsByJobId: {},
    hirerCompletedJobsCount: 0,
    hirerListingInquiries: [],
    hirerReviewedListingInquiryIds: {},
    hirerReviewedJobApplicationIds: {},
  }

  const followCounts = orFallback("follow counts", [0, 0], () =>
    Promise.all([countFollowers(profileData.id), countFollowing(profileData.id)]),
  )

  if (profileData.user_type === "freelancer") {
    const { data: freelancerData, error: freelancerError } = await supabase
      .from("freelancer_profiles")
      .select("*")
      .eq("user_id", profileData.id)
      .maybeSingle()
    if (freelancerError) {
      throw new Error("ფრილანსერის პროფილი ვერ ჩაიტვირთა.")
    }
    snapshot.freelancerProfile = freelancerData
    if (freelancerData) Object.assign(snapshot, await loadFreelancerSections(supabaseAny, freelancerData, user.id))
  }

  if (profileData.user_type === "hirer") {
    const { data: hirerData, error: hirerError } = await supabase
      .from("hirer_profiles")
      .select("*")
      .eq("user_id", profileData.id)
      .maybeSingle()
    if (hirerError) {
      throw new Error("დამქირავებლის პროფილი ვერ ჩაიტვირთა.")
    }
    snapshot.hirerProfile = hirerData
    if (hirerData) Object.assign(snapshot, await loadHirerSections(supabaseAny, hirerData, profileData.id))
  }

  const [followers, following] = await followCounts
  snapshot.followersCount = Number.isFinite(followers) ? followers : 0
  snapshot.followingCount = Number.isFinite(following) ? following : 0

  return snapshot
}

export type {
  DashboardFreelancerInquiry,
  DashboardHirerInquiry,
  FreelancerPendingJobOffer,
  HirerApplicationRow,
  ServiceDraft,
  FreelancerHirerReviewRow,
  FreelancerCompletedPlatformJob,
}
