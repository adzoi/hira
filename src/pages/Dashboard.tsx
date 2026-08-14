import type { SupabaseClient } from "@supabase/supabase-js"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import FollowListsModal, { FollowStatPills, type FollowModalTab } from "../components/FollowListsModal.tsx"
import { META_SUFFIX, resolveListingMetaPrefix, stripLegacyPricePrefix } from "../lib/listingDescription.ts"
import { formatListingPrice, normalizeListingPriceType } from "../lib/listingPrice.ts"
import { subscribeToDashboardMessaging } from "../lib/dashboardMessagingRealtime.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import type { Database } from "../lib/database.types"
import { jobVacancyStats } from "../lib/jobVacancies.ts"
import { assertField, validateReviewComment } from "../lib/validation.ts"
import { fetchDashboard } from "../lib/queries/fetchDashboard.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { assertContentRateLimit, formatContentRateLimitError } from "../lib/contentRateLimit.ts"
import { usePageMeta } from "../lib/usePageMeta.tsx"

type TranslateFn = (key: string, params?: Record<string, string | number>) => string

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
type FreelancerProfileRow = Database["public"]["Tables"]["freelancer_profiles"]["Row"]
type HirerProfileRow = Database["public"]["Tables"]["hirer_profiles"]["Row"]
type JobRow = Database["public"]["Tables"]["jobs"]["Row"]
type JobApplicationRow = Database["public"]["Tables"]["job_applications"]["Row"]

type ServiceDraft = {
  id?: string
  title: string
  description: string
  price: string
  priceType: "fixed" | "hourly" | "monthly"
  isActive: boolean
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

/** Surfaces PostgREST / Postgres codes and details (400 responses often hide in `details`). */
function formatSupabaseErr(e: unknown): string {
  if (
    e instanceof Error &&
    (e.name === "PostgrestError" || typeof (e as { code?: string }).code === "string")
  ) {
    const pe = e as Error & { details?: string; hint?: string; code?: string }
    const parts = [pe.message, pe.details, pe.hint].filter((p) => typeof p === "string" && p.length > 0)
    const body = parts.join(" — ")
    return pe.code && body ? `${body} (${pe.code})` : body || pe.message || "შენახვა ვერ მოხერხდა."
  }
  if (typeof e === "object" && e !== null && "message" in e) {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const msg = typeof o.message === "string" ? o.message : ""
    const details = typeof o.details === "string" ? o.details : ""
    const hint = typeof o.hint === "string" ? o.hint : ""
    const code = typeof o.code === "string" ? o.code : ""
    const parts = [msg, details, hint].filter(Boolean)
    if (parts.length > 0) return code ? `${parts.join(" — ")} (${code})` : parts.join(" — ")
  }
  if (e instanceof Error) return e.message || "შენახვა ვერ მოხერხდა."
  return "შენახვა ვერ მოხერხდა."
}

function isUniqueOrDuplicateJobCompletion(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.code === "23505") return true
  const m = (err.message ?? "").toLowerCase()
  return m.includes("duplicate key") || m.includes("unique constraint")
}

function embedJoinRow<T extends Record<string, unknown>>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] as T | undefined) ?? null : v
}

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

type FreelancerJobOfferStatusTab = "all" | "pending" | "accepted" | "rejected"
type FreelancerJobOfferTimeRange = "7d" | "30d" | "all"
type FreelancerListingOfferStatusTab = "all" | "pending" | "accepted" | "rejected"
type FreelancerListingOfferTimeRange = "7d" | "30d" | "all"
type HirerListingOfferStatusTab = "all" | "pending" | "accepted" | "rejected"
type HirerListingOfferTimeRange = "7d" | "30d" | "all"
type HirerApplicantStatusTab = "pending" | "accepted" | "rejected"
type HirerApplicantTimeRange = "7d" | "30d" | "all"

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

/** Freelancer marks done → pending hirer unless hirer already marked done (legacy). */
function listingStatusAfterFreelancerMarksDone(currentStatus: string): "freelancer_done" | "completed" {
  return currentStatus === "hirer_done" ? "completed" : "freelancer_done"
}

/** Hirer always completes the inquiry when they mark done. */
function listingStatusAfterHirerMarksDone(_currentStatus: string): "completed" {
  return "completed"
}

function listingInquiryStatusLabel(status: string, t: TranslateFn) {
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

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("ka-GE")
}

function formatBudget(min: number | null, max: number | null, t: TranslateFn) {
  if (min === null && max === null) return t("common.negotiable")
  if (min !== null && max !== null) return `${min}₾ - ${max}₾`
  if (min !== null) return `${min}₾+`
  return t("dashboard.maxBudget", { max: max ?? 0 })
}

function statusLabel(status: string, t: TranslateFn) {
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

function freelancerJobOfferStatusLabel(status: string, t: TranslateFn) {
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

function withinFreelancerJobOfferRange(createdAt: string, range: FreelancerJobOfferTimeRange) {
  if (range === "all") return true
  const createdMs = Date.parse(createdAt)
  if (!Number.isFinite(createdMs)) return false
  const dayMs = 24 * 60 * 60 * 1000
  const maxAgeMs = range === "7d" ? 7 * dayMs : 30 * dayMs
  return Date.now() - createdMs <= maxAgeMs
}

function withinFreelancerListingOfferRange(createdAt: string, range: FreelancerListingOfferTimeRange) {
  if (range === "all") return true
  const createdMs = Date.parse(createdAt)
  if (!Number.isFinite(createdMs)) return false
  const dayMs = 24 * 60 * 60 * 1000
  const maxAgeMs = range === "7d" ? 7 * dayMs : 30 * dayMs
  return Date.now() - createdMs <= maxAgeMs
}

function isFreelancerListingOfferAcceptedStatus(status: string) {
  return ["accepted", "in_progress", "freelancer_done", "hirer_done", "completed"].includes(status)
}

function withinHirerListingOfferRange(createdAt: string, range: HirerListingOfferTimeRange) {
  if (range === "all") return true
  const createdMs = Date.parse(createdAt)
  if (!Number.isFinite(createdMs)) return false
  const dayMs = 24 * 60 * 60 * 1000
  const maxAgeMs = range === "7d" ? 7 * dayMs : 30 * dayMs
  return Date.now() - createdMs <= maxAgeMs
}

function withinHirerApplicantRange(createdAt: string, range: HirerApplicantTimeRange) {
  if (range === "all") return true
  const createdMs = Date.parse(createdAt)
  if (!Number.isFinite(createdMs)) return false
  const dayMs = 24 * 60 * 60 * 1000
  const maxAgeMs = range === "7d" ? 7 * dayMs : 30 * dayMs
  return Date.now() - createdMs <= maxAgeMs
}

function isHirerListingOfferAcceptedStatus(status: string) {
  return ["accepted", "in_progress", "freelancer_done", "hirer_done", "completed"].includes(status)
}

function isHirerApplicantAcceptedStatus(status: string) {
  return ["accepted", "completed"].includes(status)
}

/** Accepted hire can proceed while job listing is still open (multi-slot), closed after fill, or legacy in-progress. */
function hirerAcceptedApplicantShowsJobActions(jobStatus: string) {
  return ["in_progress", "open", "closed"].includes(jobStatus)
}

function stripListingMeta(raw: string) {
  const metaPrefix = resolveListingMetaPrefix(raw)
  if (!metaPrefix) return stripLegacyPricePrefix(raw)
  const endIndex = raw.indexOf(META_SUFFIX)
  if (endIndex < 0) return stripLegacyPricePrefix(raw)
  return stripLegacyPricePrefix(raw.slice(endIndex + META_SUFFIX.length))
}

async function fetchHirerDashboardSection(
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
type FreelancerHirerReviewRow = {
  completedJobId: string
  jobId: string
  jobTitle: string
  hirerUserId: string
  hirerDisplayName: string
}

function embedJoinOne<T extends Record<string, unknown>>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] as T | undefined) ?? null : v
}

type FreelancerCompletedPlatformJob = {
  completedJobId: string
  jobDescription: string
  hirerDisplayName: string
  hirerAvatarUrl: string | null
}

function mapFreelancerCompletedPlatformJobRows(rows: unknown[] | null | undefined): FreelancerCompletedPlatformJob[] {
  if (!rows?.length) return []
  const out: FreelancerCompletedPlatformJob[] = []
  for (const raw of rows as Array<Record<string, unknown>>) {
    const job = embedJoinOne(raw.jobs as Record<string, unknown> | Record<string, unknown>[] | null)
    const hp = embedJoinOne(raw.hirer_profiles as Record<string, unknown> | Record<string, unknown>[] | null)
    const completedAt = raw.completed_at != null ? String(raw.completed_at) : ""
    if (!completedAt) continue
    const completedJobId = typeof raw.id === "string" ? raw.id : ""
    if (!completedJobId) continue

    const descRaw = job?.description != null ? String(job.description) : ""
    const titleFallback = typeof job?.title === "string" && job.title.trim() ? job.title.trim() : ""
    const jobDescription = descRaw.trim() || titleFallback || "აღწერა არ არის."

    const profiles = hp ? embedJoinOne(hp.profiles as Record<string, unknown> | Record<string, unknown>[] | null) : null
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

export default function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [dashboardUserId, setDashboardUserId] = useState("")
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [freelancerProfile, setFreelancerProfile] = useState<FreelancerProfileRow | null>(null)
  const [hirerProfile, setHirerProfile] = useState<HirerProfileRow | null>(null)
  const [hirerCompletedJobsCount, setHirerCompletedJobsCount] = useState(0)
  const [myJobs, setMyJobs] = useState<JobRow[]>([])
  const [jobApplicationsByJobId, setJobApplicationsByJobId] = useState<Record<string, number>>({})
  const [hirerApplications, setHirerApplications] = useState<HirerApplicationRow[]>([])
  const [jobDeletingId, setJobDeletingId] = useState<string | null>(null)
  const [jobsActionError, setJobsActionError] = useState("")
  const [hirerActionError, setHirerActionError] = useState("")
  const [applicationBusyId, setApplicationBusyId] = useState<string | null>(null)
  const [reviewModalItem, setReviewModalItem] = useState<HirerApplicationRow | null>(null)
  const [reviewStars, setReviewStars] = useState(5)
  const [reviewComment, setReviewComment] = useState("")
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState("")
  const [serviceDrafts, setServiceDrafts] = useState<ServiceDraft[]>([])
  const [initialServiceIds, setInitialServiceIds] = useState<string[]>([])
  const [servicesSaving, setServicesSaving] = useState(false)
  const [servicesError, setServicesError] = useState("")
  const [servicesSuccess, setServicesSuccess] = useState("")
  const [initialServicesSnapshot, setInitialServicesSnapshot] = useState("[]")
  /** Distinct logged-in hirers who visited this freelancer profile (via RPC). */
  const [hirerProfileViewerCount, setHirerProfileViewerCount] = useState(0)
  /** All profile visit events, including anonymous visitors. */
  const [overallProfileVisitCount, setOverallProfileVisitCount] = useState(0)
  /** Row count in `completed_jobs` for this freelancer (source of truth for the stat card). */
  const [freelancerCompletedJobsCount, setFreelancerCompletedJobsCount] = useState(0)
  const [freelancerHirerReviewQueue, setFreelancerHirerReviewQueue] = useState<FreelancerHirerReviewRow[]>([])
  const [freelancerHirerReviewModal, setFreelancerHirerReviewModal] = useState<FreelancerHirerReviewRow | null>(null)
  const [freelancerHirerReviewSubmitting, setFreelancerHirerReviewSubmitting] = useState(false)
  const [freelancerHirerReviewError, setFreelancerHirerReviewError] = useState("")
  const [freelancerListingCompleteModal, setFreelancerListingCompleteModal] = useState<DashboardFreelancerInquiry | null>(null)
  const [freelancerListingReviewStars, setFreelancerListingReviewStars] = useState(5)
  const [freelancerListingReviewComment, setFreelancerListingReviewComment] = useState("")
  const [freelancerListingReviewSubmitting, setFreelancerListingReviewSubmitting] = useState(false)
  const [freelancerListingReviewError, setFreelancerListingReviewError] = useState("")
  const [freelancerListingInquiries, setFreelancerListingInquiries] = useState<DashboardFreelancerInquiry[]>([])
  const [freelancerCompletedPlatformJobs, setFreelancerCompletedPlatformJobs] = useState<FreelancerCompletedPlatformJob[]>(
    [],
  )
  const [freelancerPendingJobOffers, setFreelancerPendingJobOffers] = useState<FreelancerPendingJobOffer[]>([])
  const [freelancerJobOfferStatusTab, setFreelancerJobOfferStatusTab] = useState<FreelancerJobOfferStatusTab>("all")
  const [freelancerJobOfferTimeRange, setFreelancerJobOfferTimeRange] = useState<FreelancerJobOfferTimeRange>("7d")
  const [freelancerListingOfferStatusTab, setFreelancerListingOfferStatusTab] =
    useState<FreelancerListingOfferStatusTab>("pending")
  const [freelancerListingOfferTimeRange, setFreelancerListingOfferTimeRange] =
    useState<FreelancerListingOfferTimeRange>("7d")
  const [freelancerDashboardTab, setFreelancerDashboardTab] = useState<
    "listing_offers" | "job_offers" | "my_services" | "ongoing" | "completed"
  >("listing_offers")
  const [hirerListingInquiries, setHirerListingInquiries] = useState<DashboardHirerInquiry[]>([])
  const [hirerListingOfferStatusTab, setHirerListingOfferStatusTab] = useState<HirerListingOfferStatusTab>("all")
  const [hirerListingOfferTimeRange, setHirerListingOfferTimeRange] = useState<HirerListingOfferTimeRange>("7d")
  const [hirerApplicantStatusTab, setHirerApplicantStatusTab] = useState<HirerApplicantStatusTab>("pending")
  const [hirerApplicantTimeRange, setHirerApplicantTimeRange] = useState<HirerApplicantTimeRange>("7d")
  const [hirerReviewedListingInquiryIds, setHirerReviewedListingInquiryIds] = useState<Record<string, true>>({})
  const [hirerReviewedJobApplicationIds, setHirerReviewedJobApplicationIds] = useState<Record<string, true>>({})
  const [hirerListingReviewModal, setHirerListingReviewModal] = useState<DashboardHirerInquiry | null>(null)
  const [hirerListingReviewStars, setHirerListingReviewStars] = useState(5)
  const [hirerListingReviewComment, setHirerListingReviewComment] = useState("")
  const [hirerListingReviewSubmitting, setHirerListingReviewSubmitting] = useState(false)
  const [hirerListingReviewError, setHirerListingReviewError] = useState("")
  const [listingInquiryBusyId, setListingInquiryBusyId] = useState<string | null>(null)
  const [listingInquiryDeleteBusyId, setListingInquiryDeleteBusyId] = useState<string | null>(null)
  const [jobApplicationDeleteBusyId, setJobApplicationDeleteBusyId] = useState<string | null>(null)
  const [hirerDashboardTab, setHirerDashboardTab] = useState<
    "applicants" | "my_jobs" | "listing_offers" | "ongoing" | "completed"
  >(
    "applicants",
  )
  const [dashFollowersCount, setDashFollowersCount] = useState(0)
  const [dashFollowingCount, setDashFollowingCount] = useState(0)
  const [followListsModalOpen, setFollowListsModalOpen] = useState(false)
  const [followListsModalTab, setFollowListsModalTab] = useState<FollowModalTab>("followers")

  const notifyUser = useCallback(
    async (targetUserId: string | null | undefined, title: string, body: string, link: string, type = "status_update") => {
      if (!supabase || !targetUserId) return
      try {
        await supabase.rpc("send_status_notification", {
          p_target_user_id: targetUserId,
          p_title: title,
          p_body: body,
          p_link: link,
          p_type: type,
        })
      } catch {
        /* non-blocking */
      }
    },
    [supabase],
  )
  const supabaseAny = supabase as any
  void hirerCompletedJobsCount
  void freelancerCompletedJobsCount
  void freelancerCompletedPlatformJobs
  useEffect(() => {
    const state = location.state as { successMessage?: string } | null
    if (!state?.successMessage) return

    setSuccessMessage(state.successMessage)
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: null,
    })
  }, [location.hash, location.pathname, location.search, location.state, navigate])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setDashboardUserId(user?.id ?? "")
    })
  }, [])

  const activeJobsCount = useMemo(
    () => myJobs.filter((job) => job.status === "open").length,
    [myJobs],
  )
  const hirerOngoingListingInquiries = useMemo(
    () =>
      hirerListingInquiries.filter((q) =>
        ["pending", "accepted", "in_progress", "freelancer_done", "hirer_done"].includes(q.status),
      ),
    [hirerListingInquiries],
  )
  const hirerCompletedListingInquiries = useMemo(
    () => hirerListingInquiries.filter((q) => q.status === "completed"),
    [hirerListingInquiries],
  )
  const hirerOngoingApplications = useMemo(
    () =>
      hirerApplications.filter(
        (item) => item.status !== "completed" && item.jobStatus !== "completed" && item.status !== "cancelled",
      ),
    [hirerApplications],
  )
  const hirerCompletedApplications = useMemo(
    () => hirerApplications.filter((item) => item.status === "completed" || item.jobStatus === "completed"),
    [hirerApplications],
  )
  const hirerListingOffersInRange = useMemo(
    () =>
      hirerListingInquiries.filter((item) => withinHirerListingOfferRange(item.createdAt, hirerListingOfferTimeRange)),
    [hirerListingInquiries, hirerListingOfferTimeRange],
  )
  const hirerListingOffersFiltered = useMemo(
    () =>
      hirerListingOffersInRange.filter((item) => {
        if (hirerListingOfferStatusTab === "all") return true
        if (hirerListingOfferStatusTab === "accepted") return isHirerListingOfferAcceptedStatus(item.status)
        if (hirerListingOfferStatusTab === "rejected") return ["declined", "rejected", "cancelled"].includes(item.status)
        return item.status === "pending"
      }),
    [hirerListingOfferStatusTab, hirerListingOffersInRange],
  )
  const hirerListingOfferCounts = useMemo(
    () => ({
      all: hirerListingOffersInRange.length,
      pending: hirerListingOffersInRange.filter((item) => item.status === "pending").length,
      accepted: hirerListingOffersInRange.filter((item) => isHirerListingOfferAcceptedStatus(item.status)).length,
      rejected: hirerListingOffersInRange.filter((item) => ["declined", "rejected", "cancelled"].includes(item.status)).length,
    }),
    [hirerListingOffersInRange],
  )
  const hirerApplicantsInRange = useMemo(
    () => hirerApplications.filter((item) => withinHirerApplicantRange(item.createdAt, hirerApplicantTimeRange)),
    [hirerApplications, hirerApplicantTimeRange],
  )
  const hirerApplicantsFiltered = useMemo(
    () =>
      hirerApplicantsInRange.filter((item) => {
        if (hirerApplicantStatusTab === "accepted") return isHirerApplicantAcceptedStatus(item.status)
        if (hirerApplicantStatusTab === "rejected") return ["rejected", "cancelled"].includes(item.status)
        return item.status === "pending"
      }),
    [hirerApplicantStatusTab, hirerApplicantsInRange],
  )
  const hirerApplicantCounts = useMemo(
    () => ({
      pending: hirerApplicantsInRange.filter((item) => item.status === "pending").length,
      accepted: hirerApplicantsInRange.filter((item) => isHirerApplicantAcceptedStatus(item.status)).length,
      rejected: hirerApplicantsInRange.filter((item) => ["rejected", "cancelled"].includes(item.status)).length,
    }),
    [hirerApplicantsInRange],
  )
  const freelancerOngoingListingInquiries = useMemo(
    () =>
      freelancerListingInquiries.filter((q) =>
        ["accepted", "in_progress", "freelancer_done", "hirer_done"].includes(q.status),
      ),
    [freelancerListingInquiries],
  )
  const freelancerCompletedListingInquiries = useMemo(
    () => freelancerListingInquiries.filter((q) => q.status === "completed"),
    [freelancerListingInquiries],
  )
  const freelancerListingOffersInRange = useMemo(
    () =>
      freelancerListingInquiries.filter((item) =>
        withinFreelancerListingOfferRange(item.createdAt, freelancerListingOfferTimeRange),
      ),
    [freelancerListingInquiries, freelancerListingOfferTimeRange],
  )
  const freelancerListingOffersFiltered = useMemo(
    () =>
      freelancerListingOffersInRange.filter((item) => {
        if (freelancerListingOfferStatusTab === "all") return true
        if (freelancerListingOfferStatusTab === "accepted") return isFreelancerListingOfferAcceptedStatus(item.status)
        if (freelancerListingOfferStatusTab === "rejected") return ["declined", "rejected", "cancelled"].includes(item.status)
        return item.status === "pending"
      }),
    [freelancerListingOfferStatusTab, freelancerListingOffersInRange],
  )
  const freelancerListingOfferCounts = useMemo(
    () => ({
      pending: freelancerListingOffersInRange.filter((item) => item.status === "pending").length,
      accepted: freelancerListingOffersInRange.filter((item) => isFreelancerListingOfferAcceptedStatus(item.status)).length,
      rejected: freelancerListingOffersInRange.filter((item) => ["declined", "rejected", "cancelled"].includes(item.status)).length,
    }),
    [freelancerListingOffersInRange],
  )
  const freelancerOngoingJobOffers = useMemo(
    () => freelancerPendingJobOffers.filter((offer) => ["accepted"].includes(offer.status)),
    [freelancerPendingJobOffers],
  )
  const freelancerJobOffersInRange = useMemo(
    () =>
      freelancerPendingJobOffers.filter((offer) =>
        withinFreelancerJobOfferRange(offer.createdAt, freelancerJobOfferTimeRange),
      ),
    [freelancerPendingJobOffers, freelancerJobOfferTimeRange],
  )
  const freelancerJobOffersFiltered = useMemo(
    () =>
      freelancerJobOffersInRange.filter((offer) => {
        if (freelancerJobOfferStatusTab === "all") return true
        if (freelancerJobOfferStatusTab === "accepted") return ["accepted", "completed"].includes(offer.status)
        if (freelancerJobOfferStatusTab === "rejected") return ["rejected", "cancelled"].includes(offer.status)
        return offer.status === "pending"
      }),
    [freelancerJobOfferStatusTab, freelancerJobOffersInRange],
  )
  const freelancerJobOfferCounts = useMemo(
    () => ({
      all: freelancerJobOffersInRange.length,
      pending: freelancerJobOffersInRange.filter((offer) => offer.status === "pending").length,
      accepted: freelancerJobOffersInRange.filter((offer) => ["accepted", "completed"].includes(offer.status)).length,
      rejected: freelancerJobOffersInRange.filter((offer) => ["rejected", "cancelled"].includes(offer.status)).length,
    }),
    [freelancerJobOffersInRange],
  )
  const reviewModalAlreadyReviewed = reviewModalItem
    ? Boolean(hirerReviewedJobApplicationIds[reviewModalItem.applicationId])
    : false

  const handleDeleteJob = async (jobId: string) => {
    if (!supabase || !hirerProfile?.id) return
    const confirmed = window.confirm(
      "ნამდვილად გსურს ამ განცხადების წაშლა?",
    )
    if (!confirmed) return
    setJobsActionError("")
    setJobDeletingId(jobId)
    try {
      const { error: applicationsDeleteError } = await supabase.from("job_applications").delete().eq("job_id", jobId)
      if (applicationsDeleteError) throw applicationsDeleteError
      const { error: skillsDeleteError } = await supabase.from("job_skills").delete().eq("job_id", jobId)
      if (skillsDeleteError) throw skillsDeleteError
      const { error: jobDeleteError } = await supabase
        .from("jobs")
        .delete()
        .eq("id", jobId)
        .eq("hirer_profile_id", hirerProfile.id)
      if (jobDeleteError) throw jobDeleteError
      setMyJobs((prev) => prev.filter((j) => j.id !== jobId))
      setJobApplicationsByJobId((prev) => {
        const next = { ...prev }
        delete next[jobId]
        return next
      })
      setHirerApplications((prev) => prev.filter((a) => a.jobId !== jobId))
    } catch (deleteErr) {
      setJobsActionError(deleteErr instanceof Error ? deleteErr.message : "განცხადების წაშლა ვერ მოხერხდა.")
    } finally {
      setJobDeletingId(null)
    }
  }

  const reloadHirerSection = useCallback(async () => {
    if (!supabase || !hirerProfile?.id) return
    try {
      const { myJobs, applications, counts } = await fetchHirerDashboardSection(supabase, hirerProfile.id)
      setMyJobs(myJobs)
      setHirerApplications(applications)
      setJobApplicationsByJobId(counts)
      await loadHirerApplicationReviewedFlags(applications)
    } catch {
      /* refetch failed silently */
    }
  }, [hirerProfile?.id, supabase])

  const loadHirerApplicationReviewedFlags = useCallback(
    async (applications: HirerApplicationRow[]) => {
      if (!supabase || !profile?.id || applications.length === 0) {
        setHirerReviewedJobApplicationIds({})
        return
      }
      try {
        const jobIds = Array.from(new Set(applications.map((item) => item.jobId).filter(Boolean)))
        if (jobIds.length === 0) {
          setHirerReviewedJobApplicationIds({})
          return
        }
        const { data: completedRows, error: completedErr } = await supabase
          .from("completed_jobs")
          .select("id, job_id")
          .in("job_id", jobIds)
        if (completedErr || !completedRows || completedRows.length === 0) {
          setHirerReviewedJobApplicationIds({})
          return
        }
        const completedIds = completedRows.map((row) => row.id)
        const { data: reviewRows, error: reviewErr } = await supabase
          .from("reviews")
          .select("completed_job_id")
          .eq("reviewer_id", profile.id)
          .in("completed_job_id", completedIds)
        if (reviewErr || !reviewRows || reviewRows.length === 0) {
          setHirerReviewedJobApplicationIds({})
          return
        }
        const reviewedCompletedIds = new Set(
          reviewRows.map((row) => String(row.completed_job_id ?? "")).filter(Boolean),
        )
        const reviewedJobIds = new Set(
          completedRows
            .filter((row) => reviewedCompletedIds.has(String(row.id ?? "")))
            .map((row) => String(row.job_id ?? ""))
            .filter(Boolean),
        )
        const reviewedAppMap = applications.reduce<Record<string, true>>((acc, item) => {
          if (reviewedJobIds.has(item.jobId)) acc[item.applicationId] = true
          return acc
        }, {})
        setHirerReviewedJobApplicationIds(reviewedAppMap)
      } catch {
        setHirerReviewedJobApplicationIds({})
      }
    },
    [profile?.id, supabase],
  )

  const {
    isLoading: loading,
    isError: dashboardQueryIsError,
    error: dashboardQueryError,
  } = useQuery({
    queryKey: queryKeys.dashboard(dashboardUserId || "pending"),
    queryFn: () =>
      fetchDashboard({
        navigate,
        supabaseAny,
        setError,
        setProfile,
        setFreelancerProfile,
        setHirerProfile,
        setFreelancerListingInquiries,
        setFreelancerCompletedJobsCount,
        setFreelancerHirerReviewQueue,
        setFreelancerCompletedPlatformJobs,
        setFreelancerPendingJobOffers,
        setHirerProfileViewerCount,
        setOverallProfileVisitCount,
        setMyJobs,
        setHirerApplications,
        setJobApplicationsByJobId,
        setHirerCompletedJobsCount,
        setHirerListingInquiries,
        setHirerReviewedListingInquiryIds,
        setHirerReviewedJobApplicationIds,
        setServiceDrafts,
        setInitialServicesSnapshot,
        setInitialServiceIds,
        setDashFollowersCount,
        setDashFollowingCount,
        loadHirerApplicationReviewedFlags,
      }),
    enabled: Boolean(dashboardUserId) && isSupabaseConfigured,
  })
  const dashboardLoadError = dashboardQueryIsError
    ? queryErrorMessage(dashboardQueryError, t("dashboard.loadFailed"))
    : ""
  const displayError = error || dashboardLoadError

  const reloadFreelancerListingInquiries = useCallback(async () => {
    if (!supabase || !freelancerProfile?.id) return
    try {
      const [
        { count: cjCount },
        { count: listingDoneCount },
        { data: inqRows, error: inqErr },
        { data: cjListRows, error: cjListErr },
      ] = await Promise.all([
        supabase.from("completed_jobs").select("id", { count: "exact", head: true }).eq("freelancer_profile_id", freelancerProfile.id),
        supabaseAny
          .from("service_inquiries")
          .select("id", { count: "exact", head: true })
          .eq("freelancer_profile_id", freelancerProfile.id)
          .eq("deleted_by_hirer", false)
          .eq("deleted_by_freelancer", false)
          .eq("status", "completed"),
        supabaseAny
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
          .eq("freelancer_profile_id", freelancerProfile.id)
          .eq("deleted_by_hirer", false)
          .eq("deleted_by_freelancer", false)
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
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
          .eq("freelancer_profile_id", freelancerProfile.id)
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: false })
          .limit(80),
      ])
      if (!inqErr) {
        setFreelancerListingInquiries(mapServiceInquiryRowsForFreelancer(inqRows as unknown[]))
      }
      if (!cjListErr) {
        setFreelancerCompletedPlatformJobs(mapFreelancerCompletedPlatformJobRows(cjListRows as unknown[]))
      }
      const jobDone =
        typeof cjCount === "number" ? cjCount : Number(freelancerProfile.completed_jobs_count ?? 0)
      const listingDone = typeof listingDoneCount === "number" ? listingDoneCount : 0
      setFreelancerCompletedJobsCount(jobDone + listingDone)
    } catch {
      /* ignore */
    }
  }, [freelancerProfile?.id, supabase])

  const reloadHirerListingInquiries = useCallback(async () => {
    if (!supabase || !hirerProfile?.id || !profile?.id) return
    try {
      const [{ count: hCjCount }, { count: hListingDone }, { data: hInqRows, error: hInqErr }] = await Promise.all([
        supabase.from("completed_jobs").select("id", { count: "exact", head: true }).eq("hirer_profile_id", hirerProfile.id),
        supabaseAny
          .from("service_inquiries")
          .select("id", { count: "exact", head: true })
          .eq("hirer_profile_id", hirerProfile.id)
          .eq("deleted_by_hirer", false)
          .eq("deleted_by_freelancer", false)
          .eq("status", "completed"),
        supabaseAny
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
          .eq("hirer_profile_id", hirerProfile.id)
          .eq("deleted_by_hirer", false)
          .eq("deleted_by_freelancer", false)
          .order("created_at", { ascending: false })
          .limit(40),
      ])
      if (!hInqErr) {
        const mappedHirerInquiries = mapServiceInquiryRowsForHirer(hInqRows as unknown[])
        setHirerListingInquiries(mappedHirerInquiries)
        if (mappedHirerInquiries.length > 0) {
          const inquiryIds = mappedHirerInquiries.map((item) => item.id)
          const { data: myReviewsRows, error: myReviewsErr } = await supabase
            .from("reviews")
            .select("service_inquiry_id")
            .eq("reviewer_id", profile.id)
            .in("service_inquiry_id", inquiryIds)
          if (!myReviewsErr) {
            const reviewedMap = (myReviewsRows ?? []).reduce<Record<string, true>>((acc, row) => {
              const inquiryId = String(row.service_inquiry_id ?? "")
              if (inquiryId) acc[inquiryId] = true
              return acc
            }, {})
            setHirerReviewedListingInquiryIds(reviewedMap)
          }
        } else {
          setHirerReviewedListingInquiryIds({})
        }
      }
      const hJobDone = typeof hCjCount === "number" ? hCjCount : Number(hirerProfile.completed_jobs_count ?? 0)
      const hListDone = typeof hListingDone === "number" ? hListingDone : 0
      setHirerCompletedJobsCount(hJobDone + hListDone)
    } catch {
      /* ignore */
    }
  }, [hirerProfile?.id, profile?.id, supabase])

  const reloadFreelancerPendingJobOffers = useCallback(async () => {
    if (!supabase || !freelancerProfile?.id) return
    try {
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
        .eq("freelancer_profile_id", freelancerProfile.id)
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
      setFreelancerPendingJobOffers(mappedOffers.filter((item) => item.applicationId))
    } catch (pendingErr) {
      if (import.meta.env.DEV) console.warn("[dashboard] reloadFreelancerPendingJobOffers:", pendingErr)
    }
  }, [freelancerProfile?.id, supabase])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || loading || !profile?.id) return
    const sb = supabase

    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    const debounceMs = 400

    const scheduleRefresh = () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void (async () => {
          if (profile.user_type === "freelancer" && freelancerProfile?.id) {
            await Promise.all([reloadFreelancerListingInquiries(), reloadFreelancerPendingJobOffers()])
          } else if (profile.user_type === "hirer" && hirerProfile?.id) {
            await Promise.all([reloadHirerListingInquiries(), reloadHirerSection()])
          }
        })()
      }, debounceMs)
    }

    const channel = subscribeToDashboardMessaging(sb, profile.id, scheduleRefresh)

    return () => {
      clearTimeout(debounceTimer)
      void sb.removeChannel(channel)
    }
  }, [
    loading,
    profile?.id,
    profile?.user_type,
    freelancerProfile?.id,
    hirerProfile?.id,
    supabase,
    reloadFreelancerListingInquiries,
    reloadFreelancerPendingJobOffers,
    reloadHirerListingInquiries,
    reloadHirerSection,
  ])

  const patchFreelancerListingInquiry = async (inquiryId: string, nextStatus: "accepted" | "declined" | "in_progress") => {
    if (!supabase) return
    if (nextStatus === "declined" && !window.confirm("ნამდვილად გსურს შეთავაზების უარყოფა?")) return
    setListingInquiryBusyId(inquiryId)
    try {
      if (nextStatus === "accepted") {
        const { data: current } = await supabaseAny
          .from("service_inquiries")
          .select("deleted_by_hirer")
          .eq("id", inquiryId)
          .single()
        if (current?.deleted_by_hirer === true) {
          await reloadFreelancerListingInquiries()
          return
        }
      }
      const nowIso = new Date().toISOString()
      const { error } = await supabaseAny
        .from("service_inquiries")
        .update({ status: nextStatus, updated_at: nowIso })
        .eq("id", inquiryId)
      if (error) throw error
      await reloadFreelancerListingInquiries()
    } catch {
      /* toast optional */
    } finally {
      setListingInquiryBusyId(null)
    }
  }

  const openFreelancerListingCompleteModal = (item: DashboardFreelancerInquiry) => {
    setFreelancerListingReviewError("")
    setFreelancerListingReviewStars(5)
    setFreelancerListingReviewComment("")
    setFreelancerListingCompleteModal(item)
  }

  const submitFreelancerListingCompletion = async (withReview: boolean) => {
    if (!supabase || !profile || !freelancerListingCompleteModal) return
    const modal = freelancerListingCompleteModal
    const nowIso = new Date().toISOString()
    setFreelancerListingReviewSubmitting(true)
    setFreelancerListingReviewError("")
    setListingInquiryBusyId(modal.id)
    try {
      if (withReview) {
        if (!modal.hirerUserId) throw new Error("დამქირავებლის პროფილი ვერ მოიძებნა.")
        const comment = assertField(validateReviewComment(freelancerListingReviewComment))
        if (freelancerListingReviewStars < 1 || freelancerListingReviewStars > 5) {
          throw new Error("აირჩიე შეფასება.")
        }
        const { data: existingRev } = await supabase
          .from("reviews")
          .select("id")
          .eq("service_inquiry_id", modal.id)
          .eq("reviewer_id", profile.id)
          .maybeSingle()
        if (existingRev) throw new Error("ამ შეთავაზებაზე შეფასება უკვე გაქვს გაგზავნილი.")

        const { error: reviewErr } = await supabase.from("reviews").insert({
          service_inquiry_id: modal.id,
          reviewer_id: profile.id,
          reviewee_id: modal.hirerUserId,
          rating_overall: freelancerListingReviewStars,
          rating_quality: freelancerListingReviewStars,
          rating_timeliness: freelancerListingReviewStars,
          rating_communication: freelancerListingReviewStars,
          review_text: comment,
          created_at: nowIso,
          updated_at: nowIso,
        })
        if (reviewErr) throw reviewErr
      }

      const nextStatus = listingStatusAfterFreelancerMarksDone(modal.status)
      const { error } = await supabaseAny
        .from("service_inquiries")
        .update({
          status: nextStatus,
          completed_at: nextStatus === "completed" ? nowIso : null,
          updated_at: nowIso,
        })
        .eq("id", modal.id)
      if (error) throw error

      setFreelancerListingCompleteModal(null)
      await notifyUser(
        modal.hirerUserId,
        nextStatus === "completed" ? "სამუშაო დასრულდა" : "ფრილანსერმა დაასრულა სამუშაო",
        nextStatus === "completed"
          ? `ლისტინგის „${modal.listingTitle}“ სამუშაო დასრულდა ორივე მხარის დადასტურებით.`
          : `ფრილანსერმა მიუთითა, რომ ლისტინგის „${modal.listingTitle}“ სამუშაო დასრულებულია. გთხოვთ, დაადასტუროთ დასრულება.`,
        "/dashboard",
        "listing_inquiry_status",
      )
      setSuccessMessage(
        withReview
          ? nextStatus === "completed"
            ? "შეთავაზება დასრულდა და შეფასება გაიგზავნა."
            : "შეფასება გაიგზავნა. დასრულება ელოდება დამქირავებლის დადასტურებას."
          : nextStatus === "completed"
            ? "შეთავაზება დასრულდა."
            : "დასრულება მონიშნულია — ელოდება დამქირავებლის დადასტურებას.",
      )
      await reloadFreelancerListingInquiries()
    } catch (e) {
      setFreelancerListingReviewError(formatSupabaseErr(e))
    } finally {
      setFreelancerListingReviewSubmitting(false)
      setListingInquiryBusyId(null)
    }
  }

  const closeFreelancerListingCompleteWithSkip = async () => {
    if (!freelancerListingCompleteModal) return
    if (!window.confirm("ნამდვილად გსურს დასრულება შეფასების გარეშე?")) return
    await submitFreelancerListingCompletion(false)
  }

  const deleteHirerListingInquiry = async (inquiryId: string) => {
    if (!supabase) return
    if (!window.confirm("ნამდვილად გსურს შეთავაზების წაშლა?")) return
    setListingInquiryDeleteBusyId(inquiryId)
    try {
      const { error } = await supabaseAny
        .from("service_inquiries")
        .update({ deleted_by_hirer: true, updated_at: new Date().toISOString() })
        .eq("id", inquiryId)
      if (error) throw error
      await reloadHirerListingInquiries()
    } catch {
      /* ignore */
    } finally {
      setListingInquiryDeleteBusyId(null)
    }
  }

  const deleteFreelancerListingInquiry = async (inquiryId: string) => {
    if (!supabase) return
    if (!window.confirm("ნამდვილად გსურს შეთავაზების წაშლა?")) return
    setListingInquiryDeleteBusyId(inquiryId)
    try {
      const { error } = await supabaseAny
        .from("service_inquiries")
        .update({ deleted_by_freelancer: true, updated_at: new Date().toISOString() })
        .eq("id", inquiryId)
      if (error) throw error
      await reloadFreelancerListingInquiries()
    } catch {
      /* ignore */
    } finally {
      setListingInquiryDeleteBusyId(null)
    }
  }

  const markHirerListingInquiryDone = async (item: DashboardHirerInquiry) => {
    if (!supabase) return
    setListingInquiryBusyId(item.id)
    try {
      const nowIso = new Date().toISOString()
      const confirmingFreelancer = item.status === "freelancer_done"
      const nextStatus = listingStatusAfterHirerMarksDone(item.status)
      const { error } = await supabase
        .from("service_inquiries")
        .update({
          status: nextStatus,
          completed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", item.id)
      if (error) throw error
      await notifyUser(
        item.freelancerUserId,
        "სამუშაო დასრულდა",
        confirmingFreelancer
          ? `დამქირავებელმა დაადასტურა, რომ ლისტინგის „${item.listingTitle}“ სამუშაო დასრულებულია.`
          : `დამქირავებელმა დაასრულა ლისტინგის „${item.listingTitle}“ სამუშაო.`,
        "/dashboard",
        "listing_inquiry_status",
      )
      setSuccessMessage(confirmingFreelancer ? "დასრულება დადასტურებულია." : "შეთავაზება დასრულდა.")
      await reloadHirerListingInquiries()
    } catch {
      /* ignore */
    } finally {
      setListingInquiryBusyId(null)
    }
  }

  const openHirerListingReviewModal = (item: DashboardHirerInquiry) => {
    setHirerListingReviewError("")
    setHirerListingReviewStars(5)
    setHirerListingReviewComment("")
    setHirerListingReviewModal(item)
  }

  const submitHirerListingReview = async () => {
    const modal = hirerListingReviewModal
    if (!supabase || !profile || !modal) return
    if (!modal.freelancerUserId) {
      setHirerListingReviewError("ფრილანსერის პროფილი ვერ მოიძებნა.")
      return
    }
    const commentResult = validateReviewComment(hirerListingReviewComment)
    if (commentResult.ok === false) {
      setHirerListingReviewError(commentResult.message)
      return
    }
    const comment = commentResult.value
    if (hirerListingReviewStars < 1 || hirerListingReviewStars > 5) {
      setHirerListingReviewError("აირჩიე შეფასება.")
      return
    }
    setHirerListingReviewSubmitting(true)
    setHirerListingReviewError("")
    try {
      const { data: existingRev } = await supabase
        .from("reviews")
        .select("id")
        .eq("service_inquiry_id", modal.id)
        .eq("reviewer_id", profile.id)
        .maybeSingle()
      if (existingRev) throw new Error("ამ შეთავაზებაზე შეფასება უკვე გაქვს გაგზავნილი.")

      const nowIso = new Date().toISOString()
      const { error: revErr } = await supabase.from("reviews").insert({
        service_inquiry_id: modal.id,
        reviewer_id: profile.id,
        reviewee_id: modal.freelancerUserId,
        rating_overall: hirerListingReviewStars,
        rating_quality: hirerListingReviewStars,
        rating_timeliness: hirerListingReviewStars,
        rating_communication: hirerListingReviewStars,
        review_text: comment,
        created_at: nowIso,
        updated_at: nowIso,
      })
      if (revErr) throw revErr

      setHirerListingReviewModal(null)
      setHirerReviewedListingInquiryIds((prev) => ({ ...prev, [modal.id]: true }))
      setSuccessMessage("შეფასება გაიგზავნა.")
    } catch (e) {
      setHirerListingReviewError(formatSupabaseErr(e))
    } finally {
      setHirerListingReviewSubmitting(false)
    }
  }

  const acceptApplication = async (item: HirerApplicationRow) => {
    if (!supabase || !hirerProfile?.id) return
    setHirerActionError("")
    setApplicationBusyId(item.applicationId)
    try {
      const { error: e1 } = await supabase.from("job_applications").update({ status: "accepted" }).eq("id", item.applicationId)
      if (e1) throw e1

      let incremented = false
      let vacancyNowFull = false
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data: snapshot, error: selErr } = await supabase
          .from("jobs")
          .select("accepted_count,vacancies")
          .eq("id", item.jobId)
          .eq("hirer_profile_id", hirerProfile.id)
          .maybeSingle()
        if (selErr) throw selErr
        if (!snapshot) throw new Error("სამუშაო ვერ მოიძებნა.")

        const prev = Number(snapshot.accepted_count ?? 0)
        const vac = Math.max(1, Number(snapshot.vacancies ?? 1))
        const next = prev + 1
        vacancyNowFull = next >= vac

        const updatePayload: { accepted_count: number; status?: string } = { accepted_count: next }
        if (vacancyNowFull) updatePayload.status = "closed"

        const { data: updatedRows, error: updErr } = await supabase
          .from("jobs")
          .update(updatePayload)
          .eq("id", item.jobId)
          .eq("hirer_profile_id", hirerProfile.id)
          .eq("accepted_count", prev)
          .select("id")
        if (updErr) throw updErr
        if ((updatedRows?.length ?? 0) > 0) {
          incremented = true
          break
        }
      }

      if (!incremented) {
        throw new Error("განახლება ვერ დასრულდა — განაახლე გვერდი და სცადე თავიდან.")
      }

      if (vacancyNowFull) {
        const { error: e2 } = await supabase
          .from("job_applications")
          .update({ status: "rejected" })
          .eq("job_id", item.jobId)
          .neq("id", item.applicationId)
          .eq("status", "pending")
        if (e2) throw e2
      }

      await notifyUser(
        item.freelancerUserId,
        "განცხადება მიღებულია",
        `დამქირავებელმა მიიღო შენი განცხადება სამუშაოზე „${item.jobTitle}“.`,
        "/dashboard",
        "job_application_status",
      )
      await reloadHirerSection()
    } catch (e) {
      setHirerActionError(e instanceof Error ? e.message : "შეცდომა მოხდა.")
    } finally {
      setApplicationBusyId(null)
    }
  }

  const rejectApplication = async (item: HirerApplicationRow) => {
    if (!supabase) return
    if (!window.confirm("ნამდვილად გსურს ამ განმცხადებლის უარყოფა?")) return
    setHirerActionError("")
    setApplicationBusyId(item.applicationId)
    try {
      const { error } = await supabase.from("job_applications").update({ status: "rejected" }).eq("id", item.applicationId)
      if (error) throw error
      await notifyUser(
        item.freelancerUserId,
        "განცხადება უარყოფილია",
        `დამქირავებელმა უარყო განცხადება სამუშაოზე „${item.jobTitle}“.`,
        "/dashboard",
        "job_application_status",
      )
      await reloadHirerSection()
    } catch (e) {
      setHirerActionError(e instanceof Error ? e.message : "შეცდომა.")
    } finally {
      setApplicationBusyId(null)
    }
  }

  const deleteHirerApplication = async (item: HirerApplicationRow) => {
    if (!supabase) return
    if (!window.confirm("ნამდვილად გსურს განცხადების წაშლა?")) return
    setJobApplicationDeleteBusyId(item.applicationId)
    try {
      const { error } = await supabaseAny
        .from("job_applications")
        .update({ deleted_by_hirer: true, updated_at: new Date().toISOString() })
        .eq("id", item.applicationId)
        .eq("status", "rejected")
      if (error) throw error
      await reloadHirerSection()
    } catch {
      /* ignore */
    } finally {
      setJobApplicationDeleteBusyId(null)
    }
  }

  const deleteFreelancerApplication = async (item: FreelancerPendingJobOffer) => {
    if (!supabase) return
    if (!window.confirm("ნამდვილად გსურს ამ შეთავაზების წაშლა?")) return
    setJobApplicationDeleteBusyId(item.applicationId)
    try {
      const { error, count } = await supabaseAny
        .from("job_applications")
        .update({ deleted_by_freelancer: true })
        .eq("id", item.applicationId)
        .select("id", { count: "exact", head: true })
      if (error) throw error
      void count
      // If count is 0, the RLS blocked it or row not found —
      // still remove from local state optimistically
      setFreelancerPendingJobOffers((prev) =>
        prev.filter((o) => o.applicationId !== item.applicationId),
      )
    } catch {
      /* ignore */
    } finally {
      setJobApplicationDeleteBusyId(null)
    }
  }

  const openCompleteReviewModal = (item: HirerApplicationRow) => {
    setReviewError("")
    setReviewStars(5)
    setReviewComment("")
    setReviewModalItem(item)
  }

  const submitCompleteReview = async (withReview: boolean) => {
    if (!supabase || !hirerProfile || !profile || !reviewModalItem) return
    if (withReview && !reviewModalItem.freelancerUserId) {
      setReviewError("ფრილანსერის პროფილი ვერ მოიძებნა.")
      return
    }
    setReviewSubmitting(true)
    setReviewError("")
    try {
      const nowIso = new Date().toISOString()
      const { data: existingCj } = await supabase
        .from("completed_jobs")
        .select("id")
        .eq("job_id", reviewModalItem.jobId)
        .maybeSingle()

      let completedJobId = existingCj?.id ?? null
      if (!completedJobId) {
        const { data: inserted, error: cjErr } = await supabase
          .from("completed_jobs")
          .insert({
            job_id: reviewModalItem.jobId,
            hirer_profile_id: hirerProfile.id,
            freelancer_profile_id: reviewModalItem.freelancerProfileId,
            hirer_confirmed: true,
            freelancer_confirmed: true,
            completed_at: nowIso,
            created_at: nowIso,
          })
          .select("id")
          .maybeSingle()
        if (cjErr) {
          if (isUniqueOrDuplicateJobCompletion(cjErr)) {
            const { data: dupRow, error: dupSelErr } = await supabase
              .from("completed_jobs")
              .select("id")
              .eq("job_id", reviewModalItem.jobId)
              .maybeSingle()
            if (dupSelErr) throw dupSelErr
            completedJobId = dupRow?.id ?? null
          } else {
            throw cjErr
          }
        } else {
          completedJobId = inserted?.id ?? null
        }
      }

      if (!completedJobId) throw new Error("დასრულების ჩანაწერი ვერ შეიქმნა.")

      if (withReview) {
        const comment = assertField(validateReviewComment(reviewComment))
        if (reviewStars < 1 || reviewStars > 5) {
          throw new Error("აირჩიე შეფასება.")
        }
        const { data: existingRev } = await supabase
          .from("reviews")
          .select("id")
          .eq("completed_job_id", completedJobId)
          .eq("reviewer_id", profile.id)
          .maybeSingle()
        if (existingRev) {
          throw new Error("ამ სამუშაოზე შეფასება უკვე გაქვს გაგზავნილი.")
        }

        const { error: revErr } = await supabase.from("reviews").insert({
          completed_job_id: completedJobId,
          reviewer_id: profile.id,
          reviewee_id: reviewModalItem.freelancerUserId,
          rating_overall: reviewStars,
          rating_quality: reviewStars,
          rating_timeliness: reviewStars,
          rating_communication: reviewStars,
          review_text: comment,
          created_at: nowIso,
          updated_at: nowIso,
        })
        if (revErr) throw revErr
      }

      const { error: jobErr } = await supabase
        .from("jobs")
        .update({ status: "completed", updated_at: nowIso })
        .eq("id", reviewModalItem.jobId)
        .eq("hirer_profile_id", hirerProfile.id)
      if (jobErr) throw jobErr

      const { error: appErr } = await supabase
        .from("job_applications")
        .update({ status: "completed" })
        .eq("id", reviewModalItem.applicationId)
      if (appErr) throw appErr

      setReviewModalItem(null)
      setSuccessMessage(withReview ? "სამუშაო დასრულდა და შეფასება გაიგზავნა." : "სამუშაო დასრულდა.")
      if (withReview) {
        setHirerReviewedJobApplicationIds((prev) => ({
          ...prev,
          [reviewModalItem.applicationId]: true,
        }))
      }
      await reloadHirerSection()
      const { count: afterCount } = await supabase
        .from("completed_jobs")
        .select("id", { count: "exact", head: true })
        .eq("hirer_profile_id", hirerProfile.id)
      if (typeof afterCount === "number") setHirerCompletedJobsCount(afterCount)
    } catch (e) {
      setReviewError(formatSupabaseErr(e))
    } finally {
      setReviewSubmitting(false)
    }
  }

  const closeHirerCompleteModalWithSkip = async () => {
    if (!reviewModalItem) return
    if (!window.confirm("ნამდვილად გსურს დასრულება შეფასების გარეშე?")) return
    await submitCompleteReview(false)
  }

  const openFreelancerHirerReviewModal = (item: FreelancerHirerReviewRow) => {
    setFreelancerHirerReviewError("")
    setReviewStars(5)
    setReviewComment("")
    setFreelancerHirerReviewModal(item)
  }

  const submitFreelancerHirerReview = async () => {
    const modal = freelancerHirerReviewModal
    if (!supabase || !profile || !modal) return
    const commentResult = validateReviewComment(reviewComment)
    if (commentResult.ok === false) {
      setFreelancerHirerReviewError(commentResult.message)
      return
    }
    const comment = commentResult.value
    if (reviewStars < 1 || reviewStars > 5) {
      setFreelancerHirerReviewError("აირჩიე შეფასება.")
      return
    }
    setFreelancerHirerReviewSubmitting(true)
    setFreelancerHirerReviewError("")
    try {
      const nowIso = new Date().toISOString()
      const { data: existingRev } = await supabase
        .from("reviews")
        .select("id")
        .eq("completed_job_id", modal.completedJobId)
        .eq("reviewer_id", profile.id)
        .maybeSingle()
      if (existingRev) {
        throw new Error("ამ სამუშაოზე შეფასება უკვე გაქვს გაგზავნილი.")
      }

      const { error: revErr } = await supabase.from("reviews").insert({
        completed_job_id: modal.completedJobId,
        reviewer_id: profile.id,
        reviewee_id: modal.hirerUserId,
        rating_overall: reviewStars,
        rating_quality: reviewStars,
        rating_timeliness: reviewStars,
        rating_communication: reviewStars,
        review_text: comment,
        created_at: nowIso,
        updated_at: nowIso,
      })
      if (revErr) throw revErr

      const doneId = modal.completedJobId
      setFreelancerHirerReviewModal(null)
      setFreelancerHirerReviewQueue((prev) => prev.filter((x) => x.completedJobId !== doneId))
      setSuccessMessage("დამქირავებლის შეფასება გაიგზავნა.")
    } catch (e) {
      setFreelancerHirerReviewError(formatSupabaseErr(e))
    } finally {
      setFreelancerHirerReviewSubmitting(false)
    }
  }

  const removeServiceDraft = (index: number) => {
    setServiceDrafts((prev) => prev.filter((_, i) => i !== index))
  }

  const updateServiceDraft = (index: number, patch: Partial<ServiceDraft>) => {
    setServiceDrafts((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const hasServiceChanges = useMemo(
    () => snapshotServices(serviceDrafts) !== initialServicesSnapshot,
    [serviceDrafts, initialServicesSnapshot],
  )

  const handleSaveServices = async () => {
    if (!supabase || !freelancerProfile?.id) return
    setServicesSaving(true)
    setServicesError("")
    setServicesSuccess("")

    try {
      const nonEmptyDrafts = serviceDrafts
        .map((item) => ({
          id: item.id,
          title: item.title.trim(),
          description: item.description.trim(),
          priceRaw: item.price.trim(),
          priceType: item.priceType,
          isActive: item.isActive,
        }))
        .filter((item) => item.title || item.description || item.priceRaw)

      if (nonEmptyDrafts.length > 3) {
        throw new Error("მაქსიმუმ შესაძლებელია 3 სერვისის დამატება.")
      }

      const normalized = nonEmptyDrafts.map((item, index) => {
        if (!item.title) throw new Error(`სერვისი #${index + 1}: სათაური სავალდებულოა.`)
        const price = item.priceRaw ? Number(item.priceRaw) : 0
        if (!Number.isFinite(price) || price < 0) {
          throw new Error(`სერვისი #${index + 1}: ფასი არასწორია.`)
        }
        return {
          id: item.id,
          title: item.title,
          description: item.description || null,
          price,
          price_type: item.priceType,
          is_active: item.isActive,
        }
      })

      const currentIds = normalized.map((item) => item.id).filter(Boolean) as string[]
      const idsToDelete = initialServiceIds.filter((id) => !currentIds.includes(id))

      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("services")
          .delete()
          .eq("freelancer_profile_id", freelancerProfile.id)
          .in("id", idsToDelete)
        if (deleteError) throw deleteError
      }

      for (const item of normalized) {
        if (item.id) {
          const { error: updateError } = await supabase
            .from("services")
            .update({
              title: item.title,
              description: item.description,
              price: item.price,
              price_type: item.price_type,
              is_active: item.is_active,
            })
            .eq("id", item.id)
            .eq("freelancer_profile_id", freelancerProfile.id)
          if (updateError) throw updateError
        } else {
          await assertContentRateLimit("listing-post")
          const { error: insertError } = await supabase.from("services").insert({
            freelancer_profile_id: freelancerProfile.id,
            title: item.title,
            description: item.description,
            price: item.price,
            price_type: item.price_type,
            is_active: item.is_active,
          })
          if (insertError) throw insertError
        }
      }

      const { data: refreshedServices, error: refreshError } = await supabase
        .from("services")
        .select("*")
        .eq("freelancer_profile_id", freelancerProfile.id)
        .order("created_at", { ascending: false })
      if (refreshError) throw refreshError

      const rows = refreshedServices ?? []
      setServiceDrafts(
        rows.slice(0, 3).map((item) => ({
          id: item.id,
          title: item.title ?? "",
          description: stripListingMeta(item.description ?? ""),
          price: item.price !== null && item.price !== undefined ? String(item.price) : "",
          priceType: normalizeListingPriceType(item.price_type),
          isActive: item.is_active ?? true,
        })),
      )
      setInitialServicesSnapshot(
        snapshotServices(
          rows.slice(0, 3).map((item) => ({
            id: item.id,
            title: item.title ?? "",
            description: stripListingMeta(item.description ?? ""),
            price: item.price !== null && item.price !== undefined ? String(item.price) : "",
            priceType: normalizeListingPriceType(item.price_type),
            isActive: item.is_active ?? true,
          })),
        ),
      )
      setInitialServiceIds(rows.map((item) => item.id))
      setServicesSuccess("სერვისები წარმატებით განახლდა.")
    } catch (saveError) {
      const rateMsg = formatContentRateLimitError(saveError, t)
      setServicesError(
        rateMsg ?? (saveError instanceof Error ? saveError.message : "სერვისების შენახვა ვერ მოხერხდა."),
      )
    } finally {
      setServicesSaving(false)
    }
  }

  return (

    <>
    {usePageMeta(t("dashboard.title"), t("dashboard.metaDescription"))}

    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1B2B4B]">{t("dashboard.heading")}</h1>
        </div>

        {!loading && !displayError && successMessage ? (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-green-700">
            {successMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="flex h-60 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#D4A843]" />
          </div>
        ) : displayError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{displayError}</div>
        ) : profile?.user_type === "freelancer" ? (
          <section className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-2xl font-bold text-[#1B2B4B]">
                {t("dashboard.hello", { name: profile.full_name || t("auth.freelancer") })}
              </h2>
              <FollowStatPills
                followerCount={dashFollowersCount}
                followingCount={dashFollowingCount}
                className="mt-3"
                onOpenFollowers={() => {
                  setFollowListsModalTab("followers")
                  setFollowListsModalOpen(true)
                }}
                onOpenFollowing={() => {
                  setFollowListsModalTab("following")
                  setFollowListsModalOpen(true)
                }}
              />
            </div>

            {!freelancerProfile?.is_profile_complete ? (
              <div className="rounded-xl border border-[#D4A843]/50 bg-amber-50 p-5">
                <p className="text-lg font-semibold text-[#1B2B4B]">{t("dashboard.completeProfile")}</p>
                <p className="mt-1 text-sm text-slate-700">
                  მეტი შეკვეთის მისაღებად დაასრულე პროფილის შევსება.
                </p>
                <Link
                  to="/onboarding"
                  className="mt-3 inline-block rounded-lg bg-[#D4A843] px-4 py-2 text-sm font-semibold text-[#1B2B4B]"
                >
                  პროფილის დასრულება
                </Link>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">საშუალო რეიტინგი</p>
                <p className="mt-2 text-2xl font-bold text-[#1B2B4B]">
                  {(freelancerProfile?.average_rating ?? 0).toFixed(1)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">სულ შეფასებები</p>
                <p className="mt-2 text-2xl font-bold text-[#1B2B4B]">
                  {freelancerProfile?.total_reviews_count ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">დამქირავებლები (ნახვები)</p>
                <p className="mt-2 text-2xl font-bold text-[#1B2B4B]">{hirerProfileViewerCount}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">სულ ნახვები</p>
                <p className="mt-2 text-2xl font-bold text-[#1B2B4B]">{overallProfileVisitCount}</p>
              </div>
            </div>

            {freelancerHirerReviewQueue.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="text-xl font-bold text-[#1B2B4B]">დამქირავებლის შეფასება</h3>
                <p className="mt-1 text-sm text-slate-500">
                  დასრულებულ სამუშაოებზე დააფიქსირე გამოცდილება.
                </p>
                <ul className="mt-4 space-y-3">
                  {freelancerHirerReviewQueue.map((item) => (
                    <li
                      key={item.completedJobId}
                      className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#1B2B4B]">{item.jobTitle}</p>
                        <p className="mt-1 text-sm text-slate-600">{item.hirerDisplayName}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openFreelancerHirerReviewModal(item)}
                        className="shrink-0 rounded-lg border border-[#D4A843] bg-amber-50 px-3 py-2 text-xs font-semibold text-[#1B2B4B] transition hover:bg-[#D4A843]/30"
                      >
                        შეფასების დაწყება
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
              <div className="flex flex-nowrap gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setFreelancerDashboardTab("listing_offers")}
                  className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition sm:px-3 sm:py-2 sm:text-sm ${
                    freelancerDashboardTab === "listing_offers"
                      ? "bg-[#1B2B4B] text-white"
                      : "border border-slate-300 bg-white text-[#1B2B4B] hover:border-[#D4A843]"
                  }`}
                >
                  შეთავაზებები განცხადებებზე
                </button>
                <button
                  type="button"
                  onClick={() => setFreelancerDashboardTab("job_offers")}
                  className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition sm:px-3 sm:py-2 sm:text-sm ${
                    freelancerDashboardTab === "job_offers"
                      ? "bg-[#1B2B4B] text-white"
                      : "border border-slate-300 bg-white text-[#1B2B4B] hover:border-[#D4A843]"
                  }`}
                >
                  გაგზავნილი შეთავაზებები
                </button>
                <button
                  type="button"
                  onClick={() => setFreelancerDashboardTab("my_services")}
                  className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition sm:px-3 sm:py-2 sm:text-sm ${
                    freelancerDashboardTab === "my_services"
                      ? "bg-[#1B2B4B] text-white"
                      : "border border-slate-300 bg-white text-[#1B2B4B] hover:border-[#D4A843]"
                  }`}
                >
                  ჩემი სერვისები
                </button>
                <button
                  type="button"
                  onClick={() => setFreelancerDashboardTab("ongoing")}
                  className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition sm:px-3 sm:py-2 sm:text-sm ${
                    freelancerDashboardTab === "ongoing"
                      ? "bg-[#1B2B4B] text-white"
                      : "border border-slate-300 bg-white text-[#1B2B4B] hover:border-[#D4A843]"
                  }`}
                >
                  მიმდინარე სამუშაოები
                </button>
                <button
                  type="button"
                  onClick={() => setFreelancerDashboardTab("completed")}
                  className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition sm:px-3 sm:py-2 sm:text-sm ${
                    freelancerDashboardTab === "completed"
                      ? "bg-[#1B2B4B] text-white"
                      : "border border-slate-300 bg-white text-[#1B2B4B] hover:border-[#D4A843]"
                  }`}
                >
                  დასრულებული სამუშაოები
                </button>
              </div>
            </div>

            {freelancerDashboardTab === "listing_offers" ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="text-xl font-bold text-[#1B2B4B]">შეთავაზებები განცხადებებზე</h3>
              {freelancerListingInquiries.length === 0 ? <p className="mt-4 text-sm text-slate-500">ჯერ შემოთავაზებები არ გაქვს.</p> : null}

              {freelancerListingInquiries.length > 0 ? (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFreelancerListingOfferTimeRange("7d")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        freelancerListingOfferTimeRange === "7d"
                          ? "bg-[#1B2B4B] text-white"
                          : "border border-slate-300 bg-white text-[#1B2B4B] hover:border-[#D4A843]"
                      }`}
                    >
                      1 კვირა
                    </button>
                    <button
                      type="button"
                      onClick={() => setFreelancerListingOfferTimeRange("30d")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        freelancerListingOfferTimeRange === "30d"
                          ? "bg-[#1B2B4B] text-white"
                          : "border border-slate-300 bg-white text-[#1B2B4B] hover:border-[#D4A843]"
                      }`}
                    >
                      30 დღე
                    </button>
                    <button
                      type="button"
                      onClick={() => setFreelancerListingOfferTimeRange("all")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        freelancerListingOfferTimeRange === "all"
                          ? "bg-[#1B2B4B] text-white"
                          : "border border-slate-300 bg-white text-[#1B2B4B] hover:border-[#D4A843]"
                      }`}
                    >
                      ყველა
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {([
                      ["pending", "მოლოდინში", freelancerListingOfferCounts.pending],
                      ["accepted", "დადასტურებული", freelancerListingOfferCounts.accepted],
                      ["rejected", "უარყოფილი", freelancerListingOfferCounts.rejected],
                    ] as const).map(([statusKey, label, count]) => (
                      <button
                        key={statusKey}
                        type="button"
                        onClick={() => setFreelancerListingOfferStatusTab(statusKey)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          freelancerListingOfferStatusTab === statusKey
                            ? "bg-[#1B2B4B] text-white"
                            : "border border-slate-300 bg-white text-slate-700 hover:border-[#D4A843]"
                        }`}
                      >
                        {label} ({count})
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">შეთავაზებები</p>
                  <ul className="mt-2 space-y-3">
                    {freelancerListingOffersFiltered.map((q) => (
                    <li key={q.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-[#1B2B4B]">{q.listingTitle}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {q.hirerLabel} · {formatDate(q.createdAt)} ·{" "}
                            <span className="font-semibold text-[#1B2B4B]">{listingInquiryStatusLabel(q.status, t)}</span>
                          </p>
                          {q.proposedBudget != null ? (
                            <p className="mt-1 text-sm text-slate-700">შემოთავაზებული: {q.proposedBudget.toLocaleString("ka-GE")} ₾</p>
                          ) : null}
                          {q.hirerProfileId ? (
                            <Link
                              to={`/hirer/${encodeURIComponent(q.hirerProfileId)}`}
                              className="mt-1 inline-block text-xs font-semibold text-[#D4A843] hover:underline"
                            >
                              დამქირავებლის პროფილი →
                            </Link>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700 [overflow-wrap:anywhere]">{q.message}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {q.status === "pending" ? (
                          <>
                            <button
                              type="button"
                              disabled={listingInquiryBusyId === q.id}
                              onClick={() => void patchFreelancerListingInquiry(q.id, "accepted")}
                              className="rounded-lg bg-[#1B2B4B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-50"
                            >
                              მიღება
                            </button>
                            <button
                              type="button"
                              disabled={listingInquiryBusyId === q.id}
                              onClick={() => void patchFreelancerListingInquiry(q.id, "declined")}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              უარყოფა
                            </button>
                          </>
                        ) : null}
                        {q.status === "accepted" ? (
                          <button
                            type="button"
                            disabled={listingInquiryBusyId === q.id}
                            onClick={() => void patchFreelancerListingInquiry(q.id, "in_progress")}
                            className="rounded-lg border border-[#D4A843] bg-amber-50 px-3 py-1.5 text-xs font-semibold text-[#1B2B4B] hover:bg-[#D4A843]/30 disabled:opacity-50"
                          >
                            მიმდინარეობაში
                          </button>
                        ) : null}
                        {q.status === "accepted" || q.status === "in_progress" ? (
                          <button
                            type="button"
                            disabled={listingInquiryBusyId === q.id}
                            onClick={() => openFreelancerListingCompleteModal(q)}
                            className="rounded-lg border border-emerald-600/40 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            დასრულება
                          </button>
                        ) : null}
                        {["declined", "cancelled"].includes(q.status) ? (
                          <button
                            type="button"
                            disabled={listingInquiryDeleteBusyId === q.id}
                            onClick={() => void deleteFreelancerListingInquiry(q.id)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            დამალვა
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                  </ul>
                  {freelancerListingOffersFiltered.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">ამ ფილტრით შემოთავაზებები არ მოიძებნა.</p>
                  ) : null}
                </div>
              ) : null}

            </div>
            ) : null}

            {freelancerDashboardTab === "job_offers" ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="text-xl font-bold text-[#1B2B4B]">გაგზავნილი შეთავაზებები</h3>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFreelancerJobOfferTimeRange("7d")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      freelancerJobOfferTimeRange === "7d"
                        ? "bg-[#1B2B4B] text-white"
                        : "border border-slate-300 bg-white text-[#1B2B4B] hover:border-[#D4A843]"
                    }`}
                  >
                    1 კვირა
                  </button>
                  <button
                    type="button"
                    onClick={() => setFreelancerJobOfferTimeRange("30d")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      freelancerJobOfferTimeRange === "30d"
                        ? "bg-[#1B2B4B] text-white"
                        : "border border-slate-300 bg-white text-[#1B2B4B] hover:border-[#D4A843]"
                    }`}
                  >
                    30 დღე
                  </button>
                  <button
                    type="button"
                    onClick={() => setFreelancerJobOfferTimeRange("all")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      freelancerJobOfferTimeRange === "all"
                        ? "bg-[#1B2B4B] text-white"
                        : "border border-slate-300 bg-white text-[#1B2B4B] hover:border-[#D4A843]"
                    }`}
                  >
                    ყველა
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {([
                    ["all", "ყველა", freelancerJobOfferCounts.all],
                    ["pending", "მოლოდინში", freelancerJobOfferCounts.pending],
                    ["accepted", "დადასტურებული", freelancerJobOfferCounts.accepted],
                    ["rejected", "უარყოფილი", freelancerJobOfferCounts.rejected],
                  ] as const).map(([statusKey, label, count]) => (
                    <button
                      key={statusKey}
                      type="button"
                      onClick={() => setFreelancerJobOfferStatusTab(statusKey)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        freelancerJobOfferStatusTab === statusKey
                          ? "bg-[#1B2B4B] text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:border-[#D4A843]"
                      }`}
                    >
                      {label} ({count})
                    </button>
                  ))}
                </div>
                {freelancerJobOffersFiltered.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">ამ ფილტრით შეთავაზებები არ მოიძებნა.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {freelancerJobOffersFiltered.map((offer) => (
                      <li
                        key={offer.applicationId}
                        className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 sm:flex-row sm:items-center sm:gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[#1B2B4B]">{offer.jobTitle}</p>
                          <p className="mt-0.5 text-sm text-slate-600">{offer.hirerLabel}</p>
                          <p className="text-xs text-slate-500">{formatDate(offer.createdAt)}</p>
                        </div>
                        <div className="flex w-full shrink-0 flex-row flex-wrap items-center justify-end gap-2 sm:w-auto">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              offer.status === "pending"
                                ? "bg-amber-50 text-amber-800"
                                : offer.status === "rejected"
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {freelancerJobOfferStatusLabel(offer.status, t)}
                          </span>
                          {offer.status === "pending" || offer.status === "rejected" ? (
                            <button
                              type="button"
                              disabled={jobApplicationDeleteBusyId === offer.applicationId}
                              onClick={() => void deleteFreelancerApplication(offer)}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              წაშლა
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {freelancerDashboardTab === "ongoing" ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="text-xl font-bold text-[#1B2B4B]">მიმდინარე სამუშაოები</h3>
                {freelancerOngoingListingInquiries.length === 0 && freelancerOngoingJobOffers.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">მიმდინარე სამუშაოები არ არის.</p>
                ) : (
                  <div className="mt-4 space-y-4">
                    {freelancerOngoingJobOffers.length > 0 ? (
                      <div>
                        <ul className="mt-2 space-y-3">
                          {freelancerOngoingJobOffers.map((offer) => (
                            <li
                              key={`ongoing-job-${offer.applicationId}`}
                              className="rounded-lg border border-slate-200 bg-slate-50/60 p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-semibold text-[#1B2B4B]">{offer.jobTitle}</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {offer.hirerLabel} · {formatDate(offer.createdAt)}
                                  </p>
                                </div>
                                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                  მიმდინარე
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {freelancerOngoingListingInquiries.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">მიმდინარე სამუშაოები</p>
                        <ul className="mt-2 space-y-3">
                          {freelancerOngoingListingInquiries.map((q) => (
                            <li key={`ongoing-${q.id}`} className="rounded-lg border border-slate-200 p-4">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-semibold text-[#1B2B4B]">{q.listingTitle}</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {q.hirerLabel} · {formatDate(q.createdAt)} ·{" "}
                                    <span className="font-semibold text-[#1B2B4B]">{listingInquiryStatusLabel(q.status, t)}</span>
                                  </p>
                                  {q.hirerProfileId ? (
                                    <Link
                                      to={`/hirer/${encodeURIComponent(q.hirerProfileId)}`}
                                      className="mt-1 inline-block text-xs font-semibold text-[#D4A843] hover:underline"
                                    >
                                      დამქირავებლის პროფილი →
                                    </Link>
                                  ) : null}
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {q.status === "accepted" ? (
                                  <button
                                    type="button"
                                    disabled={listingInquiryBusyId === q.id}
                                    onClick={() => void patchFreelancerListingInquiry(q.id, "in_progress")}
                                    className="rounded-lg border border-[#D4A843] bg-amber-50 px-3 py-1.5 text-xs font-semibold text-[#1B2B4B] hover:bg-[#D4A843]/30 disabled:opacity-50"
                                  >
                                    მიმდინარეობაში
                                  </button>
                                ) : null}
                                {q.status === "freelancer_done" ? (
                                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                                    ელოდება დამქირავებლის დადასტურებას
                                  </span>
                                ) : null}
                                {["accepted", "in_progress", "hirer_done"].includes(q.status) ? (
                                  <button
                                    type="button"
                                    disabled={listingInquiryBusyId === q.id}
                                    onClick={() => openFreelancerListingCompleteModal(q)}
                                    className="rounded-lg border border-emerald-600/40 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                                  >
                                    დასრულება
                                  </button>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {freelancerDashboardTab === "completed" ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="text-xl font-bold text-[#1B2B4B]">დასრულებული სამუშაოები</h3>
                {freelancerCompletedListingInquiries.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">დასრულებული სამუშაოები არ არის.</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {freelancerCompletedListingInquiries.map((q) => (
                      <li key={`done-${q.id}`} className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
                        <p className="font-semibold text-[#1B2B4B]">{q.listingTitle}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {q.hirerLabel} · {formatDate(q.completedAt ?? q.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {freelancerDashboardTab === "my_services" ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-4 flex flex-nowrap items-center justify-between gap-2">
                <h3 className="shrink-0 whitespace-nowrap text-base font-bold text-[#1B2B4B] sm:text-xl">ჩემი სერვისები</h3>
                <button
                  type="button"
                  onClick={() => navigate("/listing/new")}
                  disabled={serviceDrafts.length >= 3}
                  className="shrink-0 rounded-lg bg-[#1B2B4B] px-2 py-1 text-xs font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:py-2 sm:text-sm"
                >
                  ახალი სერვისის დამატება
                </button>
              </div>

              {serviceDrafts.length === 0 ? (
                <p className="text-sm text-slate-500">სერვისები ჯერ არ გაქვს. დაამატე პირველი!</p>
              ) : (
                <div className="space-y-3">
                  {serviceDrafts.map((service, originalIndex) => (
                    <div key={service.id ?? `new-${originalIndex}`} className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="font-semibold text-[#1B2B4B]">სერვისი #{originalIndex + 1}</p>
                        <div className="hidden items-center gap-2 sm:flex">
                          {service.id ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/listing/${service.id}/edit`)}
                              className="text-xs font-semibold text-[#1B2B4B]"
                            >
                              რედაქტირება
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => removeServiceDraft(originalIndex)}
                            className="text-xs font-semibold text-red-600"
                          >
                            წაშლა
                          </button>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-[#1B2B4B]">{service.title || "უსათაურო სერვისი"}</p>
                        <p className="text-sm text-slate-600">{service.description || "აღწერა არ არის."}</p>
                        <p className="text-sm text-slate-600">
                          ფასი:{" "}
                          {formatListingPrice(
                            Number(service.price || "0"),
                            service.priceType,
                            { negotiable: Number(service.price || "0") === 0 },
                          )}
                        </p>
                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={service.isActive}
                            onChange={(event) => updateServiceDraft(originalIndex, { isActive: event.target.checked })}
                          />
                          აქტიური
                        </label>
                      </div>
                      <div className="mt-3 flex items-center gap-2 sm:hidden">
                        {service.id ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/listing/${service.id}/edit`)}
                            className="text-xs font-semibold text-[#1B2B4B]"
                          >
                            რედაქტირება
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => removeServiceDraft(originalIndex)}
                          className="text-xs font-semibold text-red-600"
                        >
                          წაშლა
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <span>{serviceDrafts.length}/3</span>
                <button
                  type="button"
                  onClick={handleSaveServices}
                  disabled={servicesSaving || !hasServiceChanges}
                  className="rounded-lg border border-[#1B2B4B] px-3 py-1.5 font-semibold text-[#1B2B4B] disabled:opacity-60"
                >
                  {servicesSaving ? "ინახება..." : "ცვლილებების შენახვა"}
                </button>
              </div>
              {servicesError ? <p className="mt-3 text-sm text-red-600">{servicesError}</p> : null}
              {servicesSuccess ? <p className="mt-3 text-sm text-emerald-600">{servicesSuccess}</p> : null}
            </div>
            ) : null}

            {freelancerListingCompleteModal ? (
              <div
                role="dialog"
                aria-modal="true"
                className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) void closeFreelancerListingCompleteWithSkip()
                }}
              >
                <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-[#1B2B4B]">შეთავაზების დასრულება</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {freelancerListingCompleteModal.listingTitle} — {freelancerListingCompleteModal.hirerLabel}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void closeFreelancerListingCompleteWithSkip()}
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
                      aria-label="დახურვა"
                    >
                      ×
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    სურვილის შემთხვევაში შეაფასე დამქირავებელი.
                  </p>

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">შეფასება</p>
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={`listing-review-${n}`}
                          type="button"
                          onClick={() => setFreelancerListingReviewStars(n)}
                          className={`h-10 w-10 rounded-lg border text-sm font-bold transition ${
                            freelancerListingReviewStars === n
                              ? "border-[#D4A843] bg-[#D4A843] text-[#1B2B4B]"
                              : "border-slate-200 bg-white text-slate-600 hover:border-[#D4A843]"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="mt-4 block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">კომენტარი</span>
                    <textarea
                      value={freelancerListingReviewComment}
                      onChange={(e) => setFreelancerListingReviewComment(e.target.value)}
                      rows={4}
                      className="w-full min-w-0 max-w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#D4A843] focus:ring-2"
                      placeholder="როგორი იყო კომუნიკაცია და პირობები?"
                    />
                  </label>

                  {freelancerListingReviewError ? (
                    <p className="mt-2 text-sm text-red-600">{freelancerListingReviewError}</p>
                  ) : null}

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={freelancerListingReviewSubmitting}
                      onClick={() => void submitFreelancerListingCompletion(true)}
                      className="w-full rounded-lg bg-[#1B2B4B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-60"
                    >
                      {freelancerListingReviewSubmitting ? "ინახება…" : "შეფასების გაგზავნა"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {freelancerHirerReviewModal ? (
              <div
                role="dialog"
                aria-modal="true"
                className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) setFreelancerHirerReviewModal(null)
                }}
              >
                <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-[#1B2B4B]">დამქირავებლის შეფასება</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {freelancerHirerReviewModal.jobTitle} — {freelancerHirerReviewModal.hirerDisplayName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFreelancerHirerReviewModal(null)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
                      aria-label="დახურვა"
                    >
                      ×
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    შეაფასე დამქირავებელი და დაწერე მოკლე კომენტარი (მინ. 10 სიმბოლო).
                  </p>

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">შეფასება</p>
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setReviewStars(n)}
                          className={`h-10 w-10 rounded-lg border text-sm font-bold transition ${
                            reviewStars === n
                              ? "border-[#D4A843] bg-[#D4A843] text-[#1B2B4B]"
                              : "border-slate-200 bg-white text-slate-600 hover:border-[#D4A843]"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="mt-4 block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">კომენტარი</span>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      rows={4}
                      className="w-full min-w-0 max-w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#D4A843] focus:ring-2"
                      placeholder="როგორი იყო კომუნიკაცია და პირობები?"
                    />
                  </label>

                  {freelancerHirerReviewError ? (
                    <p className="mt-2 text-sm text-red-600">{freelancerHirerReviewError}</p>
                  ) : null}

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={freelancerHirerReviewSubmitting}
                      onClick={() => void submitFreelancerHirerReview()}
                      className="flex-1 rounded-lg bg-[#1B2B4B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-60"
                    >
                      {freelancerHirerReviewSubmitting ? "ინახება…" : "გაგზავნა"}
                    </button>
                    <button
                      type="button"
                      disabled={freelancerHirerReviewSubmitting}
                      onClick={() => setFreelancerHirerReviewModal(null)}
                      className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      გაუქმება
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : profile?.user_type === "hirer" ? (
          <section className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-2xl font-bold text-gray-900">
                გამარჯობა, {profile.full_name || "დამქირავებელო"}!
              </h2>
              <FollowStatPills
                followerCount={dashFollowersCount}
                followingCount={dashFollowingCount}
                className="mt-3"
                onOpenFollowers={() => {
                  setFollowListsModalTab("followers")
                  setFollowListsModalOpen(true)
                }}
                onOpenFollowing={() => {
                  setFollowListsModalTab("following")
                  setFollowListsModalOpen(true)
                }}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">განთავსებული განცხადებები</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{hirerProfile?.jobs_posted_count ?? 0}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">აქტიური განცხადებები</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{activeJobsCount}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
              <div className="flex flex-nowrap gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setHirerDashboardTab("applicants")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    hirerDashboardTab === "applicants"
                      ? "bg-[#0088FF] text-white"
                      : "border border-slate-300 bg-white text-gray-900 hover:border-[#0088FF]"
                  }`}
                >
                  განმცხადებლები
                </button>
                <button
                  type="button"
                  onClick={() => setHirerDashboardTab("my_jobs")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    hirerDashboardTab === "my_jobs"
                      ? "bg-[#0088FF] text-white"
                      : "border border-slate-300 bg-white text-gray-900 hover:border-[#0088FF]"
                  }`}
                >
                  ჩემი განცხადებები
                </button>
                <button
                  type="button"
                  onClick={() => setHirerDashboardTab("listing_offers")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    hirerDashboardTab === "listing_offers"
                      ? "bg-[#0088FF] text-white"
                      : "border border-slate-300 bg-white text-gray-900 hover:border-[#0088FF]"
                  }`}
                >
                  გაგზავნილი შეთავაზებები
                </button>
                <button
                  type="button"
                  onClick={() => setHirerDashboardTab("ongoing")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    hirerDashboardTab === "ongoing"
                      ? "bg-[#0088FF] text-white"
                      : "border border-slate-300 bg-white text-gray-900 hover:border-[#0088FF]"
                  }`}
                >
                  მიმდინარე სამუშაოები
                </button>
                <button
                  type="button"
                  onClick={() => setHirerDashboardTab("completed")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    hirerDashboardTab === "completed"
                      ? "bg-[#0088FF] text-white"
                      : "border border-slate-300 bg-white text-gray-900 hover:border-[#0088FF]"
                  }`}
                >
                  დასრულებული სამუშაოები
                </button>
              </div>
            </div>

            {hirerDashboardTab === "listing_offers" ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="text-xl font-bold text-[#1B2B4B]">ლისტინგებზე გაგზავნილი შეთავაზებები</h3>
              {hirerListingInquiries.length === 0 ? <p className="mt-4 text-sm text-slate-500">ჯერ არაფერი გაგიგზავნია.</p> : null}
              {hirerListingInquiries.length > 0 ? (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setHirerListingOfferTimeRange("7d")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        hirerListingOfferTimeRange === "7d"
                          ? "bg-[#0088FF] text-white"
                          : "border border-slate-300 bg-white text-gray-900 hover:border-[#0088FF]"
                      }`}
                    >
                      1 კვირა
                    </button>
                    <button
                      type="button"
                      onClick={() => setHirerListingOfferTimeRange("30d")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        hirerListingOfferTimeRange === "30d"
                          ? "bg-[#0088FF] text-white"
                          : "border border-slate-300 bg-white text-gray-900 hover:border-[#0088FF]"
                      }`}
                    >
                      30 დღე
                    </button>
                    <button
                      type="button"
                      onClick={() => setHirerListingOfferTimeRange("all")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        hirerListingOfferTimeRange === "all"
                          ? "bg-[#0088FF] text-white"
                          : "border border-slate-300 bg-white text-gray-900 hover:border-[#0088FF]"
                      }`}
                    >
                      ყველა
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {([
                      ["all", "ყველა", hirerListingOfferCounts.all],
                      ["pending", "მოლოდინში", hirerListingOfferCounts.pending],
                      ["accepted", "დადასტურებული", hirerListingOfferCounts.accepted],
                      ["rejected", "უარყოფილი", hirerListingOfferCounts.rejected],
                    ] as const).map(([statusKey, label, count]) => (
                      <button
                        key={statusKey}
                        type="button"
                        onClick={() => setHirerListingOfferStatusTab(statusKey)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          hirerListingOfferStatusTab === statusKey
                            ? "bg-[#0088FF] text-white"
                            : "border border-slate-300 bg-white text-slate-700 hover:border-[#0088FF]"
                        }`}
                      >
                        {label} ({count})
                      </button>
                    ))}
                  </div>
                  <ul className="mt-3 space-y-3">
                    {hirerListingOffersFiltered.map((q) => (
                      <li key={q.id} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-[#1B2B4B]">{q.listingTitle}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {q.freelancerName} · {formatDate(q.createdAt)} ·{" "}
                              <span className="font-semibold text-[#1B2B4B]">{listingInquiryStatusLabel(q.status, t)}</span>
                            </p>
                            {q.freelancerSlug ? (
                              <Link
                                to={`/freelancer/${encodeURIComponent(q.freelancerSlug)}`}
                                className="mt-1 inline-block text-xs font-semibold text-[#D4A843] hover:underline"
                              >
                                პროფილი →
                              </Link>
                            ) : null}
                            {q.proposedBudget != null ? (
                              <p className="mt-1 text-sm text-slate-700">შეთავაზებული თანხა: {q.proposedBudget.toLocaleString("ka-GE")} ₾</p>
                            ) : null}
                          </div>
                          {q.status === "pending" ? (
                            <button
                              type="button"
                              disabled={listingInquiryDeleteBusyId === q.id}
                              onClick={() => void deleteHirerListingInquiry(q.id)}
                              className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              წაშლა
                            </button>
                          ) : null}
                          {["accepted", "in_progress", "freelancer_done"].includes(q.status) ? (
                            <button
                              type="button"
                              disabled={listingInquiryBusyId === q.id}
                              onClick={() => void markHirerListingInquiryDone(q)}
                              className="shrink-0 rounded-lg border border-emerald-600/40 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              {q.status === "freelancer_done" ? "დადასტურება" : "დასრულება"}
                            </button>
                          ) : null}
                          {q.status === "completed" ? (
                            <button
                              type="button"
                              disabled={Boolean(hirerReviewedListingInquiryIds[q.id])}
                              onClick={() => openHirerListingReviewModal(q)}
                              className="shrink-0 rounded-lg border border-[#D4A843] bg-amber-50 px-3 py-1.5 text-xs font-semibold text-[#1B2B4B] hover:bg-[#D4A843]/30 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {hirerReviewedListingInquiryIds[q.id] ? "შეფასებულია" : "შეფასება"}
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700 [overflow-wrap:anywhere]">{q.message}</p>
                      </li>
                    ))}
                  </ul>
                  {hirerListingOffersFiltered.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">ამ ფილტრით შეთავაზებები არ მოიძებნა.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
            ) : null}

            {hirerDashboardTab === "my_jobs" ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-[#1B2B4B]">ჩემი განცხადებები</h3>
                <Link
                  to="/post-job"
                  className="rounded-lg bg-[#0088FF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#006ACC]"
                >
                  ახალი განცხადება
                </Link>
              </div>

              {jobsActionError ? (
                <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{jobsActionError}</p>
              ) : null}

              {myJobs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center">
                  <p className="text-slate-600">განცხადებები ჯერ არ გაქვს.</p>
                  <Link to="/post-job" className="mt-3 inline-block font-semibold text-[#D4A843] hover:underline">
                    განათავსე პირველი განცხადება
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {myJobs.map((job) => {
                    const vacancyStats = jobVacancyStats(job.vacancies, job.accepted_count)
                    return (
                    <div key={job.id} className="rounded-lg border border-slate-200 p-4">
                      <p className="truncate font-semibold text-[#1B2B4B]">{job.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                        <span className="whitespace-nowrap">{formatBudget(job.budget_min, job.budget_max, t)}</span>
                        <span className="text-slate-400" aria-hidden>•</span>
                        <span className="whitespace-nowrap">
                          {jobApplicationsByJobId[job.id] ?? 0} განმცხადებელი
                        </span>
                        <span className="text-slate-400" aria-hidden>•</span>
                        <span className="whitespace-nowrap">
                          {vacancyStats.acceptedCount}/{vacancyStats.vacancies} ვაკანსია
                        </span>
                        <span className="text-slate-400" aria-hidden>•</span>
                        <span className="whitespace-nowrap">{formatDate(job.created_at)}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {statusLabel(job.status, t)}
                        </span>
                        <Link
                          to={`/post-job/${job.id}`}
                          className="rounded-lg border border-[#0088FF] px-3 py-1.5 text-xs font-semibold text-[#0088FF] transition hover:bg-[#0088FF] hover:text-white"
                        >
                          რედაქტირება
                        </Link>
                        <button
                          type="button"
                          disabled={jobDeletingId === job.id}
                          onClick={() => void handleDeleteJob(job.id)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          {jobDeletingId === job.id ? "…" : "წაშლა"}
                        </button>
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>
            ) : null}

            {hirerDashboardTab === "ongoing" ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="text-xl font-bold text-[#1B2B4B]">მიმდინარე სამუშაოები</h3>
                {hirerOngoingApplications.length === 0 && hirerOngoingListingInquiries.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">მიმდინარე სამუშაოები არ არის.</p>
                ) : (
                  <div className="mt-4 space-y-5">
                    {hirerOngoingApplications.length > 0 ? (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">განმცხადებლები</p>
                        <div className="space-y-3">
                          {hirerOngoingApplications.map((item) => (
                            <div key={`ongoing-app-${item.applicationId}`} className="rounded-lg border border-slate-200 p-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-[#1B2B4B]">{item.freelancerName}</p>
                                  <p className="mt-1 text-sm text-slate-600">
                                    {item.jobTitle} • {formatDate(item.createdAt)} • {statusLabel(item.status, t)}
                                  </p>
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-2">
                                  {item.status === "pending" ? (
                                    <>
                                      <button
                                        type="button"
                                        disabled={applicationBusyId === item.applicationId}
                                        onClick={() => void acceptApplication(item)}
                                        className="rounded-lg bg-[#0088FF] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#006ACC] disabled:opacity-50"
                                      >
                                        მიღება
                                      </button>
                                      <button
                                        type="button"
                                        disabled={applicationBusyId === item.applicationId}
                                        onClick={() => void rejectApplication(item)}
                                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                                      >
                                        უარყოფა
                                      </button>
                                    </>
                                  ) : null}
                                  {item.status === "accepted" && hirerAcceptedApplicantShowsJobActions(item.jobStatus) ? (
                                    <button
                                      type="button"
                                      disabled={!item.freelancerUserId}
                                      onClick={() => openCompleteReviewModal(item)}
                                      className="rounded-lg border border-[#D4A843] bg-amber-50 px-3 py-1.5 text-xs font-semibold text-[#1B2B4B] transition hover:bg-[#D4A843]/30 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      დასრულება
                                    </button>
                                  ) : null}
                                  {item.status === "rejected" ? (
                                    <button
                                      type="button"
                                      disabled={jobApplicationDeleteBusyId === item.applicationId}
                                      onClick={() => void deleteHirerApplication(item)}
                                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                                    >
                                      დამალვა
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {hirerOngoingListingInquiries.length > 0 ? (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">განცხადებები</p>
                        <div className="space-y-3">
                          {hirerOngoingListingInquiries.map((q) => (
                            <div key={`ongoing-listing-${q.id}`} className="rounded-lg border border-slate-200 p-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-[#1B2B4B]">{q.listingTitle}</p>
                                  <p className="mt-1 text-sm text-slate-600">
                                    {q.freelancerName} • {formatDate(q.createdAt)} • {listingInquiryStatusLabel(q.status, t)}
                                  </p>
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-2">
                                  {q.status === "pending" ? (
                                    <button
                                      type="button"
                                      disabled={listingInquiryDeleteBusyId === q.id}
                                      onClick={() => void deleteHirerListingInquiry(q.id)}
                                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                    >
                                      წაშლა
                                    </button>
                                  ) : null}
                                  {["accepted", "in_progress", "freelancer_done"].includes(q.status) ? (
                                    <button
                                      type="button"
                                      disabled={listingInquiryBusyId === q.id}
                                      onClick={() => void markHirerListingInquiryDone(q)}
                                      className="rounded-lg border border-emerald-600/40 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                                    >
                                      {q.status === "freelancer_done" ? "დადასტურება" : "დასრულება"}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {hirerDashboardTab === "completed" ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="text-xl font-bold text-[#1B2B4B]">დასრულებული სამუშაოები</h3>
                {hirerCompletedApplications.length === 0 && hirerCompletedListingInquiries.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">დასრულებული სამუშაოები არ არის.</p>
                ) : (
                  <div className="mt-4 space-y-5">
                    {hirerCompletedApplications.length > 0 ? (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">განმცხადებლები</p>
                        <div className="space-y-3">
                          {hirerCompletedApplications.map((item) => (
                            <div key={`done-app-${item.applicationId}`} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-200 p-4">
                              <div>
                                <p className="font-semibold text-[#1B2B4B]">{item.freelancerName}</p>
                                <p className="mt-1 text-sm text-slate-600">
                                  {item.jobTitle} • {formatDate(item.createdAt)}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={!item.freelancerUserId || Boolean(hirerReviewedJobApplicationIds[item.applicationId])}
                                onClick={() => openCompleteReviewModal(item)}
                                className="rounded-lg border border-[#D4A843] bg-amber-50 px-3 py-1.5 text-xs font-semibold text-[#1B2B4B] transition hover:bg-[#D4A843]/30 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {hirerReviewedJobApplicationIds[item.applicationId] ? "შეფასებულია" : "შეფასება"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {hirerCompletedListingInquiries.length > 0 ? (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">განცხადებები</p>
                        <div className="space-y-3">
                          {hirerCompletedListingInquiries.map((q) => (
                            <div key={`done-listing-${q.id}`} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-200 p-4">
                              <div>
                                <p className="font-semibold text-[#1B2B4B]">{q.listingTitle}</p>
                                <p className="mt-1 text-sm text-slate-600">
                                  {q.freelancerName} • {formatDate(q.completedAt ?? q.createdAt)}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={Boolean(hirerReviewedListingInquiryIds[q.id])}
                                onClick={() => openHirerListingReviewModal(q)}
                                className="rounded-lg border border-[#D4A843] bg-amber-50 px-3 py-1.5 text-xs font-semibold text-[#1B2B4B] hover:bg-[#D4A843]/30 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {hirerReviewedListingInquiryIds[q.id] ? "შეფასებულია" : "შეფასება"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {hirerDashboardTab === "applicants" ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="mb-4 text-xl font-bold text-[#1B2B4B]">განმცხადებლები</h3>
              {hirerActionError ? (
                <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{hirerActionError}</p>
              ) : null}
              {hirerApplications.length === 0 ? (
                <p className="text-sm text-slate-500">ჯერჯერობით განმცხადებლები არ არიან.</p>
              ) : (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setHirerApplicantTimeRange("7d")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        hirerApplicantTimeRange === "7d"
                          ? "bg-[#0088FF] text-white"
                          : "border border-slate-300 bg-white text-gray-900 hover:border-[#0088FF]"
                      }`}
                    >
                      1 კვირა
                    </button>
                    <button
                      type="button"
                      onClick={() => setHirerApplicantTimeRange("30d")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        hirerApplicantTimeRange === "30d"
                          ? "bg-[#0088FF] text-white"
                          : "border border-slate-300 bg-white text-gray-900 hover:border-[#0088FF]"
                      }`}
                    >
                      30 დღე
                    </button>
                    <button
                      type="button"
                      onClick={() => setHirerApplicantTimeRange("all")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        hirerApplicantTimeRange === "all"
                          ? "bg-[#0088FF] text-white"
                          : "border border-slate-300 bg-white text-gray-900 hover:border-[#0088FF]"
                      }`}
                    >
                      ყველა 
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {([
                      ["pending", "მოლოდინში", hirerApplicantCounts.pending],
                      ["accepted", "დადასტურებული", hirerApplicantCounts.accepted],
                      ["rejected", "უარყოფილი", hirerApplicantCounts.rejected],
                    ] as const).map(([statusKey, label, count]) => (
                      <button
                        key={statusKey}
                        type="button"
                        onClick={() => setHirerApplicantStatusTab(statusKey)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          hirerApplicantStatusTab === statusKey
                            ? "bg-[#0088FF] text-white"
                            : "border border-slate-300 bg-white text-slate-700 hover:border-[#0088FF]"
                        }`}
                      >
                        {label} ({count})
                      </button>
                    ))}
                  </div>
                <div className="mt-3 space-y-3">
                  {hirerApplicantsFiltered.map((item) => (
                    <div
                      key={item.applicationId}
                      className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[#1B2B4B]">{item.freelancerName}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.jobTitle} • {formatDate(item.createdAt)} • {statusLabel(item.status, t)}
                        </p>
                        {item.freelancerSlug ? (
                          <Link
                            to={`/freelancer/${encodeURIComponent(item.freelancerSlug)}`}
                            className="mt-2 inline-block text-xs font-semibold text-[#D4A843] hover:underline"
                          >
                            პროფილი →
                          </Link>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {item.status === "pending" ? (
                          <>
                            <button
                              type="button"
                              disabled={applicationBusyId === item.applicationId}
                              onClick={() => void acceptApplication(item)}
                              className="rounded-lg bg-[#0088FF] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#006ACC] disabled:opacity-50"
                            >
                              დადასტურება
                            </button>
                            <button
                              type="button"
                              disabled={applicationBusyId === item.applicationId}
                              onClick={() => void rejectApplication(item)}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                            >
                              უარყოფა
                            </button>
                          </>
                        ) : null}
                        {item.status === "accepted" && hirerAcceptedApplicantShowsJobActions(item.jobStatus) ? (
                          <button
                            type="button"
                            disabled={!item.freelancerUserId}
                            onClick={() => openCompleteReviewModal(item)}
                            className="rounded-lg border border-[#D4A843] bg-amber-50 px-3 py-1.5 text-xs font-semibold text-[#1B2B4B] transition hover:bg-[#D4A843]/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            დასრულება
                          </button>
                        ) : null}
                        {item.status === "rejected" ? (
                          <button
                            type="button"
                            disabled={jobApplicationDeleteBusyId === item.applicationId}
                            onClick={() => void deleteHirerApplication(item)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                          >
                            დამალვა
                          </button>
                        ) : null}
                        {(item.status === "completed" || item.jobStatus === "completed") ? (
                          <button
                            type="button"
                            disabled={!item.freelancerUserId || Boolean(hirerReviewedJobApplicationIds[item.applicationId])}
                            onClick={() => openCompleteReviewModal(item)}
                            className="rounded-lg border border-[#D4A843] bg-amber-50 px-3 py-1.5 text-xs font-semibold text-[#1B2B4B] transition hover:bg-[#D4A843]/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {hirerReviewedJobApplicationIds[item.applicationId] ? "შეფასებულია" : "შეფასება"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                {hirerApplicantsFiltered.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">ამ ფილტრით განმცხადებლები არ მოიძებნა.</p>
                ) : null}
                </div>
              )}
            </div>
            ) : null}

            {hirerListingReviewModal ? (
              <div
                role="dialog"
                aria-modal="true"
                className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) setHirerListingReviewModal(null)
                }}
              >
                <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                  <h3 className="text-lg font-bold text-[#1B2B4B]">ფრილანსერის შეფასება</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {hirerListingReviewModal.listingTitle} — {hirerListingReviewModal.freelancerName}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    შეაფასე ფრილანსერი და დაწერე მოკლე კომენტარი (მინ. 10 სიმბოლო).
                  </p>

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">შეფასება</p>
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={`hirer-listing-review-${n}`}
                          type="button"
                          onClick={() => setHirerListingReviewStars(n)}
                          className={`h-10 w-10 rounded-lg border text-sm font-bold transition ${
                            hirerListingReviewStars === n
                              ? "border-[#D4A843] bg-[#D4A843] text-[#1B2B4B]"
                              : "border-slate-200 bg-white text-slate-600 hover:border-[#D4A843]"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="mt-4 block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">კომენტარი</span>
                    <textarea
                      value={hirerListingReviewComment}
                      onChange={(e) => setHirerListingReviewComment(e.target.value)}
                      rows={4}
                      className="w-full min-w-0 max-w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#D4A843] focus:ring-2"
                      placeholder="როგორი იყო თანამშრომლობა?"
                    />
                  </label>

                  {hirerListingReviewError ? <p className="mt-2 text-sm text-red-600">{hirerListingReviewError}</p> : null}

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={hirerListingReviewSubmitting}
                      onClick={() => void submitHirerListingReview()}
                      className="flex-1 rounded-lg bg-[#1B2B4B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-60"
                    >
                      {hirerListingReviewSubmitting ? "ინახება…" : "შეფასების გაგზავნა"}
                    </button>
                    <button
                      type="button"
                      disabled={hirerListingReviewSubmitting}
                      onClick={() => setHirerListingReviewModal(null)}
                      className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      გაუქმება
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {reviewModalItem ? (
              <div
                role="dialog"
                aria-modal="true"
                className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) void closeHirerCompleteModalWithSkip()
                }}
              >
                <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-[#1B2B4B]">სამუშაოს დასრულება</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {reviewModalItem.jobTitle} — {reviewModalItem.freelancerName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void closeHirerCompleteModalWithSkip()}
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
                      aria-label="დახურვა"
                    >
                      ×
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {reviewModalAlreadyReviewed
                      ? "ამ სამუშაოზე შეფასება უკვე გაგზავნილი გაქვს."
                      : "სურვილის შემთხვევაში შეაფასე ფრილანსერი."}
                  </p>

                  {reviewModalAlreadyReviewed ? null : (
                    <>
                      <div className="mt-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">შეფასება</p>
                        <div className="flex flex-wrap gap-2">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setReviewStars(n)}
                              className={`h-10 w-10 rounded-lg border text-sm font-bold transition ${
                                reviewStars === n
                                  ? "border-[#D4A843] bg-[#D4A843] text-[#1B2B4B]"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-[#D4A843]"
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="mt-4 block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">კომენტარი</span>
                        <textarea
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          rows={4}
                          className="w-full min-w-0 max-w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#D4A843] focus:ring-2"
                          placeholder="როგორ მოგეწონა თანამშრომლობა?"
                        />
                      </label>
                    </>
                  )}

                  {reviewError ? <p className="mt-2 text-sm text-red-600">{reviewError}</p> : null}

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={reviewSubmitting}
                      onClick={() => void submitCompleteReview(!reviewModalAlreadyReviewed)}
                      className="w-full rounded-lg bg-[#1B2B4B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-60"
                    >
                      {reviewSubmitting ? "ინახება…" : reviewModalAlreadyReviewed ? "დასრულება" : "შეფასება და დასრულება"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
            მომხმარებლის ტიპი ვერ მოიძებნა.
          </div>
        )}
        {!loading && !displayError && profile ? (
          <FollowListsModal
            open={followListsModalOpen}
            onClose={() => setFollowListsModalOpen(false)}
            profileId={profile.id}
            initialTab={followListsModalTab}
          />
        ) : null}
      </main>
    </div>
  </>
  )
}
