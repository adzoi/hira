import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../../lib/database.types"
import { META_SUFFIX, resolveListingMetaPrefix, stripLegacyPricePrefix } from "../../lib/listingDescription.ts"

/** Types and pure helpers shared by the freelancer and hirer dashboards. */
export type TranslateFn = (key: string, params?: Record<string, string | number>) => string

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
export type FreelancerProfileRow = Database["public"]["Tables"]["freelancer_profiles"]["Row"]
export type HirerProfileRow = Database["public"]["Tables"]["hirer_profiles"]["Row"]
export type JobRow = Database["public"]["Tables"]["jobs"]["Row"]
export type JobApplicationRow = Database["public"]["Tables"]["job_applications"]["Row"]

export type ServiceDraft = {
  id?: string
  title: string
  description: string
  price: string
  priceType: "fixed" | "hourly" | "monthly"
  isActive: boolean
  /** Saved posts only: VIP expiry when the service is VIP. */
  vipExpiresAt?: string | null
}

export function snapshotServices(services: ServiceDraft[]) {
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

/** Surfaces PostgREST / Postgres codes and details (400 responses often hide in `details`). */
export function formatSupabaseErr(e: unknown): string {
  if (
    e instanceof Error &&
    (e.name === "PostgrestError" || typeof (e as { code?: string }).code === "string")
  ) {
    const pe = e as Error & { details?: string; hint?: string; code?: string }
    const parts = [pe.message, pe.details, pe.hint].filter((p) => typeof p === "string" && p.length > 0)
    const body = parts.join(" - ")
    return pe.code && body ? `${body} (${pe.code})` : body || pe.message || "შენახვა ვერ მოხერხდა."
  }
  if (typeof e === "object" && e !== null && "message" in e) {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const msg = typeof o.message === "string" ? o.message : ""
    const details = typeof o.details === "string" ? o.details : ""
    const hint = typeof o.hint === "string" ? o.hint : ""
    const code = typeof o.code === "string" ? o.code : ""
    const parts = [msg, details, hint].filter(Boolean)
    if (parts.length > 0) return code ? `${parts.join(" - ")} (${code})` : parts.join(" - ")
  }
  if (e instanceof Error) return e.message || "შენახვა ვერ მოხერხდა."
  return "შენახვა ვერ მოხერხდა."
}

export function isUniqueOrDuplicateJobCompletion(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.code === "23505") return true
  const m = (err.message ?? "").toLowerCase()
  return m.includes("duplicate key") || m.includes("unique constraint")
}

export function embedJoinRow<T extends Record<string, unknown>>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] as T | undefined) ?? null : v
}

export type CancelRequestedByRole = "hirer" | "freelancer" | null

export type DashboardFreelancerInquiry = {
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

export type DashboardHirerInquiry = {
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

export type FreelancerPendingJobOffer = {
  applicationId: string
  jobId: string
  jobTitle: string
  hirerLabel: string
  hirerUserId: string | null
  createdAt: string
  status: string
  cancelRequestedBy: CancelRequestedByRole
}

export type FreelancerJobOfferStatusTab = "all" | "pending" | "accepted" | "rejected"
export type FreelancerJobOfferTimeRange = "7d" | "30d" | "all"
export type FreelancerListingOfferStatusTab = "all" | "pending" | "accepted" | "rejected"
export type FreelancerListingOfferTimeRange = "7d" | "30d" | "all"
export type HirerListingOfferStatusTab = "all" | "pending" | "accepted" | "rejected"
export type HirerListingOfferTimeRange = "7d" | "30d" | "all"
export type HirerApplicantStatusTab = "pending" | "accepted" | "rejected"
export type HirerApplicantTimeRange = "7d" | "30d" | "all"

export function mapServiceInquiryRowsForFreelancer(rows: unknown[] | null | undefined): DashboardFreelancerInquiry[] {
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

export function mapServiceInquiryRowsForHirer(rows: unknown[] | null | undefined): DashboardHirerInquiry[] {
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

/** Freelancer marks done → pending hirer unless hirer already marked done (legacy). */
export function listingStatusAfterFreelancerMarksDone(currentStatus: string): "freelancer_done" | "completed" {
  return currentStatus === "hirer_done" ? "completed" : "freelancer_done"
}

/** Hirer always completes the inquiry when they mark done. */
export function listingStatusAfterHirerMarksDone(_currentStatus: string): "completed" {
  return "completed"
}

export function listingInquiryStatusLabel(status: string, t: TranslateFn) {
  switch (status) {
    case "pending":
      return t("status.pending")
    case "accepted":
      return t("status.accepted")
    case "declined":
      return t("status.declined")
    case "in_progress":
      return t("status.inProgress")
    case "completed":
      return t("status.completed")
    case "freelancer_done":
      return t("status.freelancerDonePending")
    case "hirer_done":
      return t("status.hirerDone")
    case "cancelled":
      return t("status.cancelled")
    default:
      return status
  }
}

export type HirerApplicationRow = {
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

export function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("ka-GE")
}

export function formatBudget(min: number | null, max: number | null, t: TranslateFn) {
  if (min === null && max === null) return t("common.negotiable")
  if (min !== null && max !== null) return `${min}₾ - ${max}₾`
  if (min !== null) return `${min}₾+`
  return t("dashboard.maxBudget", { max: max ?? 0 })
}

export function statusLabel(status: string, t: TranslateFn) {
  switch (status) {
    case "open":
      return t("status.open")
    case "in_progress":
      return t("status.inProgress")
    case "closed":
      return t("status.closed")
    case "completed":
      return t("status.completed")
    case "cancelled":
      return t("status.cancelled")
    case "pending":
      return t("status.pending")
    case "accepted":
      return t("status.accepted")
    case "rejected":
      return t("status.rejected")
    default:
      return status
  }
}

export function freelancerJobOfferStatusLabel(status: string, t: TranslateFn) {
  switch (status) {
    case "pending":
      return t("status.pending")
    case "accepted":
    case "completed":
      return t("status.confirmed")
    case "rejected":
      return t("status.rejected")
    default:
      return statusLabel(status, t)
  }
}

export function withinFreelancerJobOfferRange(createdAt: string, range: FreelancerJobOfferTimeRange) {
  if (range === "all") return true
  const createdMs = Date.parse(createdAt)
  if (!Number.isFinite(createdMs)) return false
  const dayMs = 24 * 60 * 60 * 1000
  const maxAgeMs = range === "7d" ? 7 * dayMs : 30 * dayMs
  return Date.now() - createdMs <= maxAgeMs
}

export function withinFreelancerListingOfferRange(createdAt: string, range: FreelancerListingOfferTimeRange) {
  if (range === "all") return true
  const createdMs = Date.parse(createdAt)
  if (!Number.isFinite(createdMs)) return false
  const dayMs = 24 * 60 * 60 * 1000
  const maxAgeMs = range === "7d" ? 7 * dayMs : 30 * dayMs
  return Date.now() - createdMs <= maxAgeMs
}

export function isFreelancerListingOfferAcceptedStatus(status: string) {
  return ["accepted", "in_progress", "freelancer_done", "hirer_done", "completed"].includes(status)
}

export function withinHirerListingOfferRange(createdAt: string, range: HirerListingOfferTimeRange) {
  if (range === "all") return true
  const createdMs = Date.parse(createdAt)
  if (!Number.isFinite(createdMs)) return false
  const dayMs = 24 * 60 * 60 * 1000
  const maxAgeMs = range === "7d" ? 7 * dayMs : 30 * dayMs
  return Date.now() - createdMs <= maxAgeMs
}

export function withinHirerApplicantRange(createdAt: string, range: HirerApplicantTimeRange) {
  if (range === "all") return true
  const createdMs = Date.parse(createdAt)
  if (!Number.isFinite(createdMs)) return false
  const dayMs = 24 * 60 * 60 * 1000
  const maxAgeMs = range === "7d" ? 7 * dayMs : 30 * dayMs
  return Date.now() - createdMs <= maxAgeMs
}

export function isHirerListingOfferAcceptedStatus(status: string) {
  return ["accepted", "in_progress", "freelancer_done", "hirer_done", "completed"].includes(status)
}

export function isHirerApplicantAcceptedStatus(status: string) {
  return ["accepted", "completed"].includes(status)
}

/** Accepted hire can proceed while job listing is still open (multi-slot), closed after fill, or legacy in-progress. */
export function hirerAcceptedApplicantShowsJobActions(jobStatus: string) {
  return ["in_progress", "open", "closed"].includes(jobStatus)
}

export function stripListingMeta(raw: string) {
  const metaPrefix = resolveListingMetaPrefix(raw)
  if (!metaPrefix) return stripLegacyPricePrefix(raw)
  const endIndex = raw.indexOf(META_SUFFIX)
  if (endIndex < 0) return stripLegacyPricePrefix(raw)
  return stripLegacyPricePrefix(raw.slice(endIndex + META_SUFFIX.length))
}

export async function fetchHirerDashboardSection(
  client: SupabaseClient,
  hirerProfileId: string,
): Promise<{ myJobs: JobRow[]; applications: HirerApplicationRow[]; counts: Record<string, number> }> {
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

  if (jobIds.length === 0) {
    return { myJobs: myJobsList, applications: [], counts: {} }
  }

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

/** Completed work where the freelancer may still rate the hirer (same `reviews` row shape as hirer→freelancer). */
export type FreelancerHirerReviewRow = {
  completedJobId: string
  jobId: string
  jobTitle: string
  hirerUserId: string
  hirerDisplayName: string
}
