import type { NavigateFunction } from "react-router-dom"
import type { Dispatch, SetStateAction } from "react"
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

export type DashboardFetchActions = {
  navigate: NavigateFunction
  supabaseAny: any
  setError: Dispatch<SetStateAction<string>>
  setProfile: Dispatch<SetStateAction<ProfileRow | null>>
  setFreelancerProfile: Dispatch<SetStateAction<FreelancerProfileRow | null>>
  setHirerProfile: Dispatch<SetStateAction<HirerProfileRow | null>>
  setFreelancerListingInquiries: Dispatch<SetStateAction<DashboardFreelancerInquiry[]>>
  setFreelancerCompletedJobsCount: Dispatch<SetStateAction<number>>
  setFreelancerHirerReviewQueue: Dispatch<SetStateAction<FreelancerHirerReviewRow[]>>
  setFreelancerCompletedPlatformJobs: Dispatch<SetStateAction<FreelancerCompletedPlatformJob[]>>
  setFreelancerPendingJobOffers: Dispatch<SetStateAction<FreelancerPendingJobOffer[]>>
  setHirerProfileViewerCount: Dispatch<SetStateAction<number>>
  setOverallProfileVisitCount: Dispatch<SetStateAction<number>>
  setMyJobs: Dispatch<SetStateAction<JobRow[]>>
  setHirerApplications: Dispatch<SetStateAction<HirerApplicationRow[]>>
  setJobApplicationsByJobId: Dispatch<SetStateAction<Record<string, number>>>
  setHirerCompletedJobsCount: Dispatch<SetStateAction<number>>
  setHirerListingInquiries: Dispatch<SetStateAction<DashboardHirerInquiry[]>>
  setHirerReviewedListingInquiryIds: Dispatch<SetStateAction<Record<string, true>>>
  setHirerReviewedJobApplicationIds: Dispatch<SetStateAction<Record<string, true>>>
  setServiceDrafts: Dispatch<SetStateAction<ServiceDraft[]>>
  setInitialServicesSnapshot: Dispatch<SetStateAction<string>>
  setInitialServiceIds: Dispatch<SetStateAction<string[]>>
  setDashFollowersCount: Dispatch<SetStateAction<number>>
  setDashFollowingCount: Dispatch<SetStateAction<number>>
  loadHirerApplicationReviewedFlags: (applications: HirerApplicationRow[]) => Promise<void>
}

export async function fetchDashboard(actions: DashboardFetchActions): Promise<string> {

      if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase პარამეტრები ვერ მოიძებნა.")
      }

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError || !user) {
          actions.navigate("/login", { replace: true })
          return ""
        }

        const { data: profileData, error: profileError } = await supabase
          .rpc("get_my_profile")
          .single()

        if (profileError || !profileData) {
          throw new Error("პროფილის მონაცემები ვერ ჩაიტვირთა.")
        }

        actions.setProfile(profileData)

        let freelancerData: FreelancerProfileRow | null = null
        let hirerData: HirerProfileRow | null = null

        if (profileData.user_type === "freelancer") {
          const { data, error: freelancerError } = await supabase
            .from("freelancer_profiles")
            .select("*")
            .eq("user_id", profileData.id)
            .maybeSingle()

          if (freelancerError) {
            throw new Error("ფრილანსერის პროფილი ვერ ჩაიტვირთა.")
          }
          freelancerData = data
          actions.setFreelancerProfile(freelancerData)

          if (freelancerData) {
            try {
              const { data: inqRows, error: inqLoadErr } = await actions.supabaseAny
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
              actions.setFreelancerListingInquiries(mapServiceInquiryRowsForFreelancer(inqRows as unknown[]))
            } catch (inqErr) {
              if (import.meta.env.DEV) console.warn("[dashboard] service_inquiries load:", inqErr)
              actions.setFreelancerListingInquiries([])
            }
          } else {
            actions.setFreelancerCompletedJobsCount(0)
            actions.setFreelancerHirerReviewQueue([])
            actions.setFreelancerListingInquiries([])
            actions.setFreelancerCompletedPlatformJobs([])
            actions.setFreelancerPendingJobOffers([])
            actions.setHirerProfileViewerCount(0)
            actions.setOverallProfileVisitCount(0)
          }
        }

        if (profileData.user_type === "hirer") {
          const { data, error: hirerError } = await supabase
            .from("hirer_profiles")
            .select("*")
            .eq("user_id", profileData.id)
            .maybeSingle()

          if (hirerError) {
            throw new Error("დამქირავებლის პროფილი ვერ ჩაიტვირთა.")
          }
          hirerData = data
          actions.setHirerProfile(hirerData)

          if (hirerData) {
            const { data: myJobsData, error: myJobsError } = await supabase
              .from("jobs")
              .select("id,title,status")
              .eq("hirer_profile_id", hirerData.id)
              .order("created_at", { ascending: false })

            if (myJobsError) throw myJobsError
            const myJobsList = (myJobsData ?? []) as JobRow[]
            actions.setMyJobs(myJobsList)

            const jobIds = myJobsList.map((j) => j.id)
            const jobStatusById = myJobsList.reduce<Record<string, string>>((acc, j) => {
              acc[j.id] = j.status
              return acc
            }, {})
            const jobTitleById = myJobsList.reduce<Record<string, string>>((acc, j) => {
              acc[j.id] = j.title
              return acc
            }, {})

            if (jobIds.length > 0) {
              const { data: applicationsData, error: applicationsError } = await actions.supabaseAny
                .from("job_applications")
                .select("*")
                .in("job_id", jobIds)
                .eq("deleted_by_hirer", false)
                .eq("deleted_by_freelancer", false)
                .order("created_at", { ascending: false })
                .limit(100)
              if (applicationsError) throw applicationsError

              const apps = (applicationsData ?? []) as JobApplicationRow[]
              const freelancerIds = [...new Set(apps.map((a) => a.freelancer_profile_id))]
              const { data: freelancerProfilesData, error: freelancerProfilesError } = await supabase
                .from("freelancer_profiles")
                .select("id,user_id,slug,profiles!freelancer_profiles_user_id_fkey(full_name)")
                .in("id", freelancerIds)
              if (freelancerProfilesError) throw freelancerProfilesError

              const profileMap = new Map(
                (freelancerProfilesData ?? []).map((fp: any) => [
                  fp.id,
                  {
                    userId: fp.user_id as string,
                    slug: (fp.slug as string | null) ?? null,
                    fullName: (fp.profiles?.full_name as string | null) ?? "ფრილანსერი",
                  },
                ]),
              )

              const applications: HirerApplicationRow[] = apps.map((app) => {
                const p = profileMap.get(app.freelancer_profile_id)
                return {
                  applicationId: app.id,
                  jobId: app.job_id,
                  jobTitle: jobTitleById[app.job_id] ?? "განცხადება",
                  jobStatus: jobStatusById[app.job_id] ?? "open",
                  freelancerProfileId: app.freelancer_profile_id,
                  freelancerUserId: p?.userId ?? "",
                  freelancerName: p?.fullName ?? "ფრილანსერი",
                  freelancerSlug: p?.slug ?? null,
                  createdAt: app.created_at,
                  status: app.status,
                  cancelRequestedBy: ((app as unknown as Record<string, unknown>).cancel_requested_by as CancelRequestedByRole) ?? null,
                }
              })

              const counts = apps.reduce<Record<string, number>>((acc, app) => {
                acc[app.job_id] = (acc[app.job_id] ?? 0) + 1
                return acc
              }, {})

              actions.setHirerApplications(applications)
              actions.setJobApplicationsByJobId(counts)
            } else {
              actions.setHirerApplications([])
              actions.setJobApplicationsByJobId({})
            }
          } else {
            actions.setHirerCompletedJobsCount(0)
            actions.setHirerListingInquiries([])
            actions.setHirerReviewedListingInquiryIds({})
            actions.setHirerReviewedJobApplicationIds({})
            actions.setMyJobs([])
            actions.setHirerApplications([])
            actions.setJobApplicationsByJobId({})
          }
        }


        if (profileData.id) {
          void (async () => {
            try {
              const [n, nf] = await Promise.all([countFollowers(profileData.id), countFollowing(profileData.id)])
              actions.setDashFollowersCount(Number.isFinite(n) ? n : 0)
              actions.setDashFollowingCount(Number.isFinite(nf) ? nf : 0)
            } catch {
              actions.setDashFollowersCount(0)
              actions.setDashFollowingCount(0)
            }
          })()
        }

        if (profileData.user_type === "freelancer" && freelancerData) {
          void (async () => {
            try {
              const queue = await loadFreelancerHirerReviewQueue(supabase, freelancerData.id, user.id)
              actions.setFreelancerHirerReviewQueue(queue)
            } catch (queueErr) {
              if (import.meta.env.DEV) console.warn("[dashboard] freelancer hirer review queue:", queueErr)
              actions.setFreelancerHirerReviewQueue([])
            }
          })()

          void (async () => {
            try {
              const { data: pendingAppsRows, error: pendingAppsErr } = await actions.supabaseAny
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
              actions.setFreelancerPendingJobOffers(mappedOffers.filter((item) => item.applicationId))
            } catch (pendingAppsLoadErr) {
              if (import.meta.env.DEV) console.warn("[dashboard] freelancer pending job offers:", pendingAppsLoadErr)
              actions.setFreelancerPendingJobOffers([])
            }
          })()

          void (async () => {
            try {
              const { data: cjRows, error: cjRowsErr } = await supabase
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
              actions.setFreelancerCompletedPlatformJobs(mapFreelancerCompletedPlatformJobRows(cjRows as unknown[]))
            } catch (cjListErr) {
              if (import.meta.env.DEV) console.warn("[dashboard] completed_jobs list:", cjListErr)
              actions.setFreelancerCompletedPlatformJobs([])
            }
          })()

          void (async () => {
            try {
              const [{ count: cjCount, error: cjCountErr }, { count: listingDoneCount, error: listingDoneErr }] =
                await Promise.all([
                  supabase.from("completed_jobs").select("id", { count: "exact", head: true }).eq("freelancer_profile_id", freelancerData.id),
                  actions.supabaseAny
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
              actions.setFreelancerCompletedJobsCount(
                cjCountErr
                  ? Number(freelancerData.completed_jobs_count ?? 0) + (listingDoneErr ? 0 : listingDone)
                  : jobDone + (listingDoneErr ? 0 : listingDone),
              )
            } catch {
              actions.setFreelancerCompletedJobsCount(Number(freelancerData.completed_jobs_count ?? 0))
            }
          })()

          void (async () => {
            try {
              const [{ data: hirerVisitorsRpc, error: hirerVisitorsRpcError }, totalVisits] = await Promise.all([
                supabase.rpc("count_distinct_hirer_visitors_to_freelancer", {
                  target_freelancer_profile_id: freelancerData.id,
                }),
                countFreelancerProfileVisits(freelancerData.id),
              ])
              if (hirerVisitorsRpcError && import.meta.env.DEV) {
                console.warn("[dashboard] hirer visitor count RPC:", hirerVisitorsRpcError.message)
              }
              const hv = hirerVisitorsRpc == null ? 0 : Number(hirerVisitorsRpc)
              actions.setHirerProfileViewerCount(Number.isFinite(hv) ? hv : 0)
              actions.setOverallProfileVisitCount(totalVisits ?? 0)
            } catch {
              actions.setHirerProfileViewerCount(0)
              actions.setOverallProfileVisitCount(0)
            }
          })()

          void (async () => {
            try {
              const { data: servicesData, error: servicesError } = await supabase
                .from("services")
                .select("*")
                .eq("freelancer_profile_id", freelancerData.id)
                .order("created_at", { ascending: false })

              if (servicesError) throw servicesError
              const serviceRows = servicesData ?? []
              const nextDrafts = serviceRows.slice(0, 3).map((item) => ({
                id: item.id,
                title: item.title ?? "",
                description: stripListingMeta(item.description ?? ""),
                price: item.price !== null && item.price !== undefined ? String(item.price) : "",
                priceType: normalizeListingPriceType(item.price_type),
                isActive: item.is_active ?? true,
                vipExpiresAt: item.is_vip ? item.vip_expires_at : null,
              }))
              actions.setServiceDrafts(nextDrafts)
              actions.setInitialServicesSnapshot(snapshotServices(nextDrafts))
              actions.setInitialServiceIds(serviceRows.map((item) => item.id))
            } catch {
              actions.setServiceDrafts([])
              actions.setInitialServicesSnapshot(snapshotServices([]))
              actions.setInitialServiceIds([])
            }
          })()
        }

        if (profileData.user_type === "hirer" && hirerData) {
          void (async () => {
            try {
              const [{ count: hCjCount, error: hCjErr }, { count: hListingDone, error: hListingDoneErr }] =
                await Promise.all([
                  supabase.from("completed_jobs").select("id", { count: "exact", head: true }).eq("hirer_profile_id", hirerData.id),
                  actions.supabaseAny
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
              actions.setHirerCompletedJobsCount(
                hCjErr
                  ? Number(hirerData.completed_jobs_count ?? 0) + (hListingDoneErr ? 0 : hListDone)
                  : hJobDone + (hListingDoneErr ? 0 : hListDone),
              )
            } catch {
              actions.setHirerCompletedJobsCount(Number(hirerData.completed_jobs_count ?? 0))
            }
          })()

          void (async () => {
            try {
              const { data: hInqRows, error: hInqErr } = await actions.supabaseAny
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
              const mappedHirerInquiries = mapServiceInquiryRowsForHirer(hInqRows as unknown[])
              actions.setHirerListingInquiries(mappedHirerInquiries)
              if (mappedHirerInquiries.length > 0) {
                const inquiryIds = mappedHirerInquiries.map((item) => item.id)
                const { data: myReviewsRows, error: myReviewsErr } = await supabase
                  .from("reviews")
                  .select("service_inquiry_id")
                  .eq("reviewer_id", profileData.id)
                  .in("service_inquiry_id", inquiryIds)
                if (!myReviewsErr) {
                  const reviewedMap = (myReviewsRows ?? []).reduce<Record<string, true>>((acc, row) => {
                    const inquiryId = String(row.service_inquiry_id ?? "")
                    if (inquiryId) acc[inquiryId] = true
                    return acc
                  }, {})
                  actions.setHirerReviewedListingInquiryIds(reviewedMap)
                }
              } else {
                actions.setHirerReviewedListingInquiryIds({})
              }
            } catch (hInqLoadErr) {
              if (import.meta.env.DEV) console.warn("[dashboard] hirer service_inquiries:", hInqLoadErr)
              actions.setHirerListingInquiries([])
              actions.setHirerReviewedListingInquiryIds({})
            }
          })()

          void (async () => {
            try {
              const { myJobs, applications, counts } = await fetchHirerDashboardSection(supabase, hirerData.id)
              actions.setMyJobs(myJobs)
              actions.setHirerApplications(applications)
              actions.setJobApplicationsByJobId(counts)
              await actions.loadHirerApplicationReviewedFlags(applications)
            } catch (hirerSectionErr) {
              if (import.meta.env.DEV) console.warn("[dashboard] hirer dashboard section:", hirerSectionErr)
            }
          })()
        }
        return user.id
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "მონაცემები ვერ ჩაიტვირთა."
        actions.setError(message)
        throw loadError instanceof Error ? loadError : new Error(message)
      }
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
