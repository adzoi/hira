import type { SupabaseClient } from "@supabase/supabase-js"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import Navbar from "../components/Navbar"
import { countFreelancerProfileVisits } from "../lib/profileVisits"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import type { Database } from "../lib/database.types"

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
type FreelancerProfileRow = Database["public"]["Tables"]["freelancer_profiles"]["Row"]
type HirerProfileRow = Database["public"]["Tables"]["hirer_profiles"]["Row"]
type JobRow = Database["public"]["Tables"]["jobs"]["Row"]
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"]
type JobApplicationRow = Database["public"]["Tables"]["job_applications"]["Row"]

type ServiceDraft = {
  id?: string
  title: string
  description: string
  price: string
  deliveryDays: string
  isActive: boolean
}

function snapshotServices(services: ServiceDraft[]) {
  return JSON.stringify(
    services.map((item) => ({
      id: item.id ?? null,
      title: item.title.trim(),
      description: item.description.trim(),
      price: item.price.trim(),
      deliveryDays: item.deliveryDays.trim(),
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

type DashboardFreelancerInquiry = {
  id: string
  createdAt: string
  message: string
  proposedBudget: number | null
  status: string
  completedAt: string | null
  listingTitle: string
  hirerLabel: string
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
    })
  }
  return out
}

function listingInquiryStatusLabel(status: string) {
  switch (status) {
    case "pending":
      return "მოლოდინში"
    case "accepted":
      return "მიღებული"
    case "declined":
      return "უარყოფილი"
    case "in_progress":
      return "მიმდინარე"
    case "completed":
      return "დასრულებული"
    case "cancelled":
      return "გაუქმებული"
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
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("ka-GE")
}

function formatBudget(min: number | null, max: number | null) {
  if (min === null && max === null) return "ბიუჯეტი შეთანხმებით"
  if (min !== null && max !== null) return `${min}₾ - ${max}₾`
  if (min !== null) return `${min}₾+`
  return `მაქს. ${max}₾`
}

function statusLabel(status: string) {
  switch (status) {
    case "open":
      return "ღია"
    case "in_progress":
      return "მიმდინარე"
    case "completed":
      return "დასრულებული"
    case "cancelled":
      return "გაუქმებული"
    case "pending":
      return "მოლოდინში"
    case "accepted":
      return "მიღებული"
    case "rejected":
      return "უარყოფილი"
    default:
      return status
  }
}

function stripListingMeta(raw: string) {
  const prefix = "<!--gigori-meta:"
  const suffix = "-->"
  if (!raw.startsWith(prefix)) return raw
  const endIndex = raw.indexOf(suffix)
  if (endIndex < 0) return raw
  return raw.slice(endIndex + suffix.length).trimStart()
}

async function fetchHirerDashboardSection(
  client: SupabaseClient,
  hirerProfileId: string,
): Promise<{ myJobs: JobRow[]; applications: HirerApplicationRow[]; counts: Record<string, number> }> {
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

  const { data: applicationsData, error: applicationsError } = await client
    .from("job_applications")
    .select("*")
    .in("job_id", jobIds)
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

async function loadFreelancerHirerReviewQueue(
  client: SupabaseClient,
  freelancerProfileId: string,
  profileUserId: string,
): Promise<FreelancerHirerReviewRow[]> {
  const { data: rows, error } = await client
    .from("completed_jobs")
    .select(
      `
      id,
      job_id,
      hirer_profile_id,
      jobs ( title ),
      hirer_profiles ( user_id, company_name )
    `,
    )
    .eq("freelancer_profile_id", freelancerProfileId)
  if (error) throw error

  const cjList = (rows ?? []) as Array<{
    id: string
    job_id: string
    hirer_profile_id: string
    jobs: { title: string | null } | { title: string | null }[] | null
    hirer_profiles: { user_id: string; company_name: string | null } | { user_id: string; company_name: string | null }[] | null
  }>
  if (cjList.length === 0) return []

  const cjIds = cjList.map((r) => r.id)
  const { data: myRevs, error: revErr } = await client
    .from("reviews")
    .select("completed_job_id")
    .eq("reviewer_id", profileUserId)
    .in("completed_job_id", cjIds)
  if (revErr) throw revErr
  const reviewed = new Set((myRevs ?? []).map((r) => r.completed_job_id))

  const out: FreelancerHirerReviewRow[] = []
  for (const row of cjList) {
    if (reviewed.has(row.id)) continue
    const job = embedJoinOne(row.jobs as Record<string, unknown> | Record<string, unknown>[] | null)
    const hp = embedJoinOne(row.hirer_profiles as Record<string, unknown> | Record<string, unknown>[] | null)
    const jobTitle = typeof job?.title === "string" && job.title.trim() ? job.title : "სამუშაო"
    const hirerUserId = typeof hp?.user_id === "string" ? hp.user_id : ""
    if (!hirerUserId) continue
    const company = typeof hp?.company_name === "string" ? hp.company_name.trim() : ""
    out.push({
      completedJobId: row.id,
      jobId: row.job_id,
      jobTitle,
      hirerUserId,
      hirerDisplayName: company || "დამქირავებელი",
    })
  }
  return out
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [freelancerProfile, setFreelancerProfile] = useState<FreelancerProfileRow | null>(null)
  const [hirerProfile, setHirerProfile] = useState<HirerProfileRow | null>(null)
  const [hirerCompletedJobsCount, setHirerCompletedJobsCount] = useState(0)
  const [openJobs, setOpenJobs] = useState<JobRow[]>([])
  const [categoriesById, setCategoriesById] = useState<Record<string, string>>({})
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
  const [freelancerListingInquiries, setFreelancerListingInquiries] = useState<DashboardFreelancerInquiry[]>([])
  const [hirerListingInquiries, setHirerListingInquiries] = useState<DashboardHirerInquiry[]>([])
  const [listingInquiryBusyId, setListingInquiryBusyId] = useState<string | null>(null)

  useEffect(() => {
    document.title = "დაშბორდი — გიგორი"
  }, [])

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
    const loadDashboard = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setError("Supabase პარამეტრები ვერ მოიძებნა.")
        setLoading(false)
        return
      }

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError || !user) {
          navigate("/login", { replace: true })
          return
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single()

        if (profileError || !profileData) {
          throw new Error("პროფილის მონაცემები ვერ ჩაიტვირთა.")
        }

        setProfile(profileData)

        if (profileData.user_type === "freelancer") {
          const { data: freelancerData, error: freelancerError } = await supabase
            .from("freelancer_profiles")
            .select("*")
            .eq("user_id", profileData.id)
            .maybeSingle()

          if (freelancerError) {
            throw new Error("ფრილანსერის პროფილი ვერ ჩაიტვირთა.")
          }
          setFreelancerProfile(freelancerData)

          if (freelancerData) {
            const [{ count: cjCount, error: cjCountErr }, { count: listingDoneCount, error: listingDoneErr }] =
              await Promise.all([
                supabase.from("completed_jobs").select("id", { count: "exact", head: true }).eq("freelancer_profile_id", freelancerData.id),
                supabase
                  .from("service_inquiries")
                  .select("id", { count: "exact", head: true })
                  .eq("freelancer_profile_id", freelancerData.id)
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
            setFreelancerCompletedJobsCount(
              cjCountErr
                ? Number(freelancerData.completed_jobs_count ?? 0) + (listingDoneErr ? 0 : listingDone)
                : jobDone + (listingDoneErr ? 0 : listingDone),
            )

            let hirerReviewQueue: FreelancerHirerReviewRow[] = []
            try {
              hirerReviewQueue = await loadFreelancerHirerReviewQueue(supabase, freelancerData.id, user.id)
            } catch (queueErr) {
              if (import.meta.env.DEV) {
                console.warn("[dashboard] freelancer hirer review queue:", queueErr)
              }
            }
            setFreelancerHirerReviewQueue(hirerReviewQueue)

            try {
              const { data: inqRows, error: inqLoadErr } = await supabase
                .from("service_inquiries")
                .select(
                  `
                  id,
                  created_at,
                  message,
                  proposed_budget,
                  status,
                  completed_at,
                  services ( title ),
                  hirer_profiles ( company_name )
                `,
                )
                .eq("freelancer_profile_id", freelancerData.id)
                .order("created_at", { ascending: false })
                .limit(40)
              if (inqLoadErr) throw inqLoadErr
              setFreelancerListingInquiries(mapServiceInquiryRowsForFreelancer(inqRows as unknown[]))
            } catch (inqErr) {
              if (import.meta.env.DEV) console.warn("[dashboard] service_inquiries load:", inqErr)
              setFreelancerListingInquiries([])
            }

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
            setHirerProfileViewerCount(Number.isFinite(hv) ? hv : 0)
            setOverallProfileVisitCount(totalVisits ?? 0)

            const { data: servicesData, error: servicesError } = await supabase
              .from("services")
              .select("*")
              .eq("freelancer_profile_id", freelancerData.id)
              .order("created_at", { ascending: false })

            if (servicesError) throw new Error("სერვისები ვერ ჩაიტვირთა.")
            const serviceRows = servicesData ?? []
            setServiceDrafts(
              serviceRows.slice(0, 3).map((item) => ({
                id: item.id,
                title: item.title ?? "",
                description: stripListingMeta(item.description ?? ""),
                price: item.price !== null && item.price !== undefined ? String(item.price) : "",
                deliveryDays: item.delivery_days ? String(item.delivery_days) : "3",
                isActive: item.is_active ?? true,
              })),
            )
            setInitialServicesSnapshot(
              snapshotServices(
                serviceRows.slice(0, 3).map((item) => ({
                  id: item.id,
                  title: item.title ?? "",
                  description: stripListingMeta(item.description ?? ""),
                  price: item.price !== null && item.price !== undefined ? String(item.price) : "",
                  deliveryDays: item.delivery_days ? String(item.delivery_days) : "3",
                  isActive: item.is_active ?? true,
                })),
              ),
            )
            setInitialServiceIds(serviceRows.map((item) => item.id))
          } else {
            setFreelancerCompletedJobsCount(0)
            setFreelancerHirerReviewQueue([])
            setFreelancerListingInquiries([])
            setHirerProfileViewerCount(0)
            setOverallProfileVisitCount(0)
          }

          const [{ data: openJobsData, error: openJobsError }, { data: categoriesData, error: categoriesError }] =
            await Promise.all([
              supabase
                .from("jobs")
                .select("*")
                .eq("status", "open")
                .order("created_at", { ascending: false })
                .limit(5),
              supabase.from("categories").select("id, name_ka"),
            ])

          if (openJobsError) throw new Error("ღია განცხადებები ვერ ჩაიტვირთა.")
          if (categoriesError) throw new Error("კატეგორიები ვერ ჩაიტვირთა.")

          setOpenJobs(openJobsData ?? [])
          const categoryMap =
            categoriesData?.reduce<Record<string, string>>((acc, category: Pick<CategoryRow, "id" | "name_ka">) => {
              acc[category.id] = category.name_ka
              return acc
            }, {}) ?? {}
          setCategoriesById(categoryMap)
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
          setHirerProfile(hirerData)

          if (hirerData) {
            const [{ count: hCjCount, error: hCjErr }, { count: hListingDone, error: hListingDoneErr }] =
              await Promise.all([
                supabase.from("completed_jobs").select("id", { count: "exact", head: true }).eq("hirer_profile_id", hirerData.id),
                supabase
                  .from("service_inquiries")
                  .select("id", { count: "exact", head: true })
                  .eq("hirer_profile_id", hirerData.id)
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
            setHirerCompletedJobsCount(
              hCjErr
                ? Number(hirerData.completed_jobs_count ?? 0) + (hListingDoneErr ? 0 : hListDone)
                : hJobDone + (hListingDoneErr ? 0 : hListDone),
            )

            try {
              const { data: hInqRows, error: hInqErr } = await supabase
                .from("service_inquiries")
                .select(
                  `
                  id,
                  created_at,
                  message,
                  proposed_budget,
                  status,
                  completed_at,
                  services ( title ),
                  freelancer_profiles (
                    slug,
                    profiles:profiles!freelancer_profiles_user_id_fkey ( full_name )
                  )
                `,
                )
                .eq("hirer_profile_id", hirerData.id)
                .order("created_at", { ascending: false })
                .limit(40)
              if (hInqErr) throw hInqErr
              setHirerListingInquiries(mapServiceInquiryRowsForHirer(hInqRows as unknown[]))
            } catch (hInqLoadErr) {
              if (import.meta.env.DEV) console.warn("[dashboard] hirer service_inquiries:", hInqLoadErr)
              setHirerListingInquiries([])
            }

            const { myJobs, applications, counts } = await fetchHirerDashboardSection(supabase, hirerData.id)
            setMyJobs(myJobs)
            setHirerApplications(applications)
            setJobApplicationsByJobId(counts)
          } else {
            setHirerCompletedJobsCount(0)
            setHirerListingInquiries([])
            setMyJobs([])
            setHirerApplications([])
            setJobApplicationsByJobId({})
          }
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "მონაცემები ვერ ჩაიტვირთა."
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [navigate])

  const activeJobsCount = useMemo(
    () => myJobs.filter((job) => job.status === "open").length,
    [myJobs],
  )

  const handleDeleteJob = async (jobId: string) => {
    if (!supabase || !hirerProfile?.id) return
    const confirmed = window.confirm(
      "ნამდვილად გსურს ამ განცხადების წაშლა? დაკავშირებული განმცხადებლების ჩანაწერებიც იშლება.",
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
    } catch {
      /* refetch failed silently */
    }
  }, [hirerProfile?.id, supabase])

  const reloadFreelancerListingInquiries = useCallback(async () => {
    if (!supabase || !freelancerProfile?.id) return
    try {
      const [{ count: cjCount }, { count: listingDoneCount }, { data: inqRows, error: inqErr }] = await Promise.all([
        supabase.from("completed_jobs").select("id", { count: "exact", head: true }).eq("freelancer_profile_id", freelancerProfile.id),
        supabase
          .from("service_inquiries")
          .select("id", { count: "exact", head: true })
          .eq("freelancer_profile_id", freelancerProfile.id)
          .eq("status", "completed"),
        supabase
          .from("service_inquiries")
          .select(
            `
            id,
            created_at,
            message,
            proposed_budget,
            status,
            completed_at,
            services ( title ),
            hirer_profiles ( company_name )
          `,
          )
          .eq("freelancer_profile_id", freelancerProfile.id)
          .order("created_at", { ascending: false })
          .limit(40),
      ])
      if (!inqErr) {
        setFreelancerListingInquiries(mapServiceInquiryRowsForFreelancer(inqRows as unknown[]))
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
    if (!supabase || !hirerProfile?.id) return
    try {
      const [{ count: hCjCount }, { count: hListingDone }, { data: hInqRows, error: hInqErr }] = await Promise.all([
        supabase.from("completed_jobs").select("id", { count: "exact", head: true }).eq("hirer_profile_id", hirerProfile.id),
        supabase
          .from("service_inquiries")
          .select("id", { count: "exact", head: true })
          .eq("hirer_profile_id", hirerProfile.id)
          .eq("status", "completed"),
        supabase
          .from("service_inquiries")
          .select(
            `
            id,
            created_at,
            message,
            proposed_budget,
            status,
            completed_at,
            services ( title ),
            freelancer_profiles (
              slug,
              profiles:profiles!freelancer_profiles_user_id_fkey ( full_name )
            )
          `,
          )
          .eq("hirer_profile_id", hirerProfile.id)
          .order("created_at", { ascending: false })
          .limit(40),
      ])
      if (!hInqErr) {
        setHirerListingInquiries(mapServiceInquiryRowsForHirer(hInqRows as unknown[]))
      }
      const hJobDone = typeof hCjCount === "number" ? hCjCount : Number(hirerProfile.completed_jobs_count ?? 0)
      const hListDone = typeof hListingDone === "number" ? hListingDone : 0
      setHirerCompletedJobsCount(hJobDone + hListDone)
    } catch {
      /* ignore */
    }
  }, [hirerProfile?.id, supabase])

  const patchFreelancerListingInquiry = async (inquiryId: string, nextStatus: "accepted" | "declined" | "in_progress" | "completed") => {
    if (!supabase) return
    setListingInquiryBusyId(inquiryId)
    try {
      const nowIso = new Date().toISOString()
      const patch: Record<string, unknown> = { status: nextStatus, updated_at: nowIso }
      if (nextStatus === "completed") {
        patch.completed_at = nowIso
      }
      const { error } = await supabase.from("service_inquiries").update(patch).eq("id", inquiryId)
      if (error) throw error
      await reloadFreelancerListingInquiries()
    } catch {
      /* toast optional */
    } finally {
      setListingInquiryBusyId(null)
    }
  }

  const cancelHirerListingInquiry = async (inquiryId: string) => {
    if (!supabase) return
    if (!window.confirm("გაუქმდეს ეს შეთავაზება?")) return
    setListingInquiryBusyId(inquiryId)
    try {
      const { error } = await supabase
        .from("service_inquiries")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", inquiryId)
      if (error) throw error
      await reloadHirerListingInquiries()
    } catch {
      /* ignore */
    } finally {
      setListingInquiryBusyId(null)
    }
  }

  const acceptApplication = async (item: HirerApplicationRow) => {
    if (!supabase || !hirerProfile?.id) return
    setHirerActionError("")
    setApplicationBusyId(item.applicationId)
    try {
      const { error: e1 } = await supabase.from("job_applications").update({ status: "accepted" }).eq("id", item.applicationId)
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from("job_applications")
        .update({ status: "rejected" })
        .eq("job_id", item.jobId)
        .neq("id", item.applicationId)
        .eq("status", "pending")
      if (e2) throw e2
      const { error: e3 } = await supabase
        .from("jobs")
        .update({ status: "in_progress" })
        .eq("id", item.jobId)
        .eq("hirer_profile_id", hirerProfile.id)
      if (e3) throw e3
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
      await reloadHirerSection()
    } catch (e) {
      setHirerActionError(e instanceof Error ? e.message : "შეცდომა მოხდა.")
    } finally {
      setApplicationBusyId(null)
    }
  }

  const openCompleteReviewModal = (item: HirerApplicationRow) => {
    setReviewError("")
    setReviewStars(5)
    setReviewComment("")
    setReviewModalItem(item)
  }

  const submitCompleteReview = async () => {
    if (!supabase || !hirerProfile || !profile || !reviewModalItem) return
    const comment = reviewComment.trim()
    if (comment.length < 10) {
      setReviewError("კომენტარი მინიმუმ 10 სიმბოლო უნდა იყოს.")
      return
    }
    if (reviewStars < 1 || reviewStars > 5) {
      setReviewError("აირჩიე შეფასება 1-დან 5 ვარსკვლაური.")
      return
    }
    if (!reviewModalItem.freelancerUserId) {
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
      setSuccessMessage("სამუშაო დასრულდა და შეფასება გაიგზავნა.")
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

  const openFreelancerHirerReviewModal = (item: FreelancerHirerReviewRow) => {
    setFreelancerHirerReviewError("")
    setReviewStars(5)
    setReviewComment("")
    setFreelancerHirerReviewModal(item)
  }

  const submitFreelancerHirerReview = async () => {
    const modal = freelancerHirerReviewModal
    if (!supabase || !profile || !modal) return
    const comment = reviewComment.trim()
    if (comment.length < 10) {
      setFreelancerHirerReviewError("კომენტარი მინიმუმ 10 სიმბოლო უნდა იყოს.")
      return
    }
    if (reviewStars < 1 || reviewStars > 5) {
      setFreelancerHirerReviewError("აირჩიე შეფასება 1-დან 5 ვარსკვლაური.")
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

  const handleLogout = async () => {
    if (!supabase) {
      navigate("/", { replace: true })
      return
    }
    await supabase.auth.signOut()
    navigate("/", { replace: true })
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
          deliveryDaysRaw: item.deliveryDays.trim(),
          isActive: item.isActive,
        }))
        .filter((item) => item.title || item.description || item.priceRaw || item.deliveryDaysRaw)

      if (nonEmptyDrafts.length > 3) {
        throw new Error("მაქსიმუმ 3 სერვისის დამატება შეგიძლია.")
      }

      const normalized = nonEmptyDrafts.map((item, index) => {
        if (!item.title) throw new Error(`სერვისი #${index + 1}: სათაური სავალდებულოა.`)
        const price = item.priceRaw ? Number(item.priceRaw) : 0
        if (!Number.isFinite(price) || price < 0) {
          throw new Error(`სერვისი #${index + 1}: ფასი არასწორია.`)
        }
        const deliveryDays = Number(item.deliveryDaysRaw || "0")
        if (!Number.isInteger(deliveryDays) || deliveryDays <= 0) {
          throw new Error(`სერვისი #${index + 1}: ვადა უნდა იყოს დადებითი მთელი რიცხვი.`)
        }
        return {
          id: item.id,
          title: item.title,
          description: item.description || null,
          price,
          delivery_days: deliveryDays,
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
              delivery_days: item.delivery_days,
              is_active: item.is_active,
            })
            .eq("id", item.id)
            .eq("freelancer_profile_id", freelancerProfile.id)
          if (updateError) throw updateError
        } else {
          const { error: insertError } = await supabase.from("services").insert({
            freelancer_profile_id: freelancerProfile.id,
            title: item.title,
            description: item.description,
            price: item.price,
            delivery_days: item.delivery_days,
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
          deliveryDays: item.delivery_days ? String(item.delivery_days) : "3",
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
            deliveryDays: item.delivery_days ? String(item.delivery_days) : "3",
            isActive: item.is_active ?? true,
          })),
        ),
      )
      setInitialServiceIds(rows.map((item) => item.id))
      setServicesSuccess("სერვისები წარმატებით განახლდა.")
    } catch (saveError) {
      setServicesError(saveError instanceof Error ? saveError.message : "სერვისების შენახვა ვერ მოხერხდა.")
    } finally {
      setServicesSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-[#1B2B4B]">დაშბორდი</h1>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-[#1B2B4B] px-4 py-2 text-sm font-semibold text-[#1B2B4B] transition hover:bg-[#1B2B4B] hover:text-white"
          >
            გასვლა
          </button>
        </div>

        {!loading && !error && successMessage ? (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-green-700">
            {successMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="flex h-60 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#D4A843]" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
        ) : profile?.user_type === "freelancer" ? (
          <section className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-2xl font-bold text-[#1B2B4B]">
                გამარჯობა, {profile.full_name || "ფრილანსერო"}!
              </h2>
            </div>

            {!freelancerProfile?.is_profile_complete ? (
              <div className="rounded-xl border border-[#D4A843]/50 bg-amber-50 p-5">
                <p className="text-lg font-semibold text-[#1B2B4B]">შეავსე პროფილი</p>
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

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">საშუალო რეიტინგი</p>
                <p className="mt-2 text-2xl font-bold text-[#1B2B4B]">
                  {(freelancerProfile?.average_rating ?? 0).toFixed(1)} ★
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">სულ შეფასებები</p>
                <p className="mt-2 text-2xl font-bold text-[#1B2B4B]">
                  {freelancerProfile?.total_reviews_count ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">დასრულებული სამუშაოები</p>
                <p className="mt-2 text-2xl font-bold text-[#1B2B4B]">{freelancerCompletedJobsCount}</p>
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
                  დასრულებულ სამუშაოებზე დააფიქსირე გამოცდილება — ეს ეხმარება სხვა ფრილანსერებს.
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

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="text-xl font-bold text-[#1B2B4B]">შეთავაზებები ლისტინგებზე</h3>
              <p className="mt-1 text-sm text-slate-500">
                დამქირავებლის პირდაპირი მოთხოვნა შენს სერვისზე (ლისტინგიდან). დასრულება ფიქსირდება სტატუსით „დასრულებული“ — ცალკე განცხადება არ სჭირდება.
              </p>
              {freelancerListingInquiries.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">ჯერ შეთავაზებები არ გაქვს.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {freelancerListingInquiries.map((q) => (
                    <li key={q.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-[#1B2B4B]">{q.listingTitle}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {q.hirerLabel} · {formatDate(q.createdAt)} ·{" "}
                            <span className="font-semibold text-[#1B2B4B]">{listingInquiryStatusLabel(q.status)}</span>
                          </p>
                          {q.proposedBudget != null ? (
                            <p className="mt-1 text-sm text-slate-700">შემოთავაზებული: {q.proposedBudget.toLocaleString("ka-GE")} ₾</p>
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
                            onClick={() => void patchFreelancerListingInquiry(q.id, "completed")}
                            className="rounded-lg border border-emerald-600/40 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            დასრულება
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-[#1B2B4B]">ჩემი სერვისები</h3>
                <button
                  type="button"
                  onClick={() => navigate("/listing/new")}
                  disabled={serviceDrafts.length >= 3}
                  className="rounded-lg bg-[#1B2B4B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:cursor-not-allowed disabled:opacity-50"
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
                        <div className="flex items-center gap-2">
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
                        <div className="grid gap-3 sm:grid-cols-2">
                          <p className="text-sm text-slate-600">ფასი: {service.price || "0"}₾</p>
                          <p className="text-sm text-slate-600">ვადა: {service.deliveryDays || "3"} დღე</p>
                        </div>
                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={service.isActive}
                            onChange={(event) => updateServiceDraft(originalIndex, { isActive: event.target.checked })}
                          />
                          აქტიური
                        </label>
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

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-[#1B2B4B]">ღია განცხადებები</h3>
                <Link to="/jobs" className="text-sm font-semibold text-[#D4A843] hover:underline">
                  იხილე ყველა
                </Link>
              </div>

              <div className="space-y-3">
                {openJobs.map((job) => (
                  <div key={job.id} className="rounded-lg border border-slate-200 p-4">
                    <p className="font-semibold text-[#1B2B4B]">{job.title}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatBudget(job.budget_min, job.budget_max)} •{" "}
                      {categoriesById[job.category_id] ?? "კატეგორია"} • {formatDate(job.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

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
                  <h3 className="text-lg font-bold text-[#1B2B4B]">დამქირავებლის შეფასება</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {freelancerHirerReviewModal.jobTitle} — {freelancerHirerReviewModal.hirerDisplayName}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    შეაფასე თანამშრომლობა 1-დან 5 ვარსკვლაურამდე და დაწერე მოკლე კომენტარი (მინ. 10 სიმბოლო).
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
              <h2 className="text-2xl font-bold text-[#1B2B4B]">
                გამარჯობა, {profile.full_name || "დამქირავებელო"}!
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">განთავსებული განცხადებები</p>
                <p className="mt-2 text-2xl font-bold text-[#1B2B4B]">{hirerProfile?.jobs_posted_count ?? 0}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">აქტიური განცხადებები</p>
                <p className="mt-2 text-2xl font-bold text-[#1B2B4B]">{activeJobsCount}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">დასრულებული სამუშაოები</p>
                <p className="mt-2 text-2xl font-bold text-[#1B2B4B]">{hirerCompletedJobsCount}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="text-xl font-bold text-[#1B2B4B]">ლისტინგებზე გაგზავნილი შეთავაზებები</h3>
              <p className="mt-1 text-sm text-slate-500">
                ფრილანსერი ხედავს ამას თავის დაშბორდზე. სამუშაოს დასრულება იქ ფიქსირდება სტატუსით — განცხადების გამოქვეყნება არ გჭირდება.
              </p>
              {hirerListingInquiries.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">ჯერ არაფერი გაგიგზავნია. იხილე ლისტინგები და დააჭირე „შეთავაზება“.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {hirerListingInquiries.map((q) => (
                    <li key={q.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-[#1B2B4B]">{q.listingTitle}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {q.freelancerName} · {formatDate(q.createdAt)} ·{" "}
                            <span className="font-semibold text-[#1B2B4B]">{listingInquiryStatusLabel(q.status)}</span>
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
                            disabled={listingInquiryBusyId === q.id}
                            onClick={() => void cancelHirerListingInquiry(q.id)}
                            className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            გაუქმება
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700 [overflow-wrap:anywhere]">{q.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-[#1B2B4B]">ჩემი განცხადებები</h3>
                <Link
                  to="/post-job"
                  className="rounded-lg bg-[#1B2B4B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B]"
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
                  {myJobs.map((job) => (
                    <div key={job.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[#1B2B4B]">{job.title}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {formatBudget(job.budget_min, job.budget_max)} • {jobApplicationsByJobId[job.id] ?? 0}{" "}
                            განმცხადებელი • {formatDate(job.created_at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {statusLabel(job.status)}
                          </span>
                          <Link
                            to={`/post-job/${job.id}`}
                            className="rounded-lg border border-[#1B2B4B] px-3 py-1.5 text-xs font-semibold text-[#1B2B4B] transition hover:bg-[#1B2B4B] hover:text-white"
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
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="mb-2 text-xl font-bold text-[#1B2B4B]">განმცხადებლები</h3>
              <p className="mb-4 text-sm text-slate-500">მიიღე განმცხადება, შეასრულე სამუშაო და დატოვე შეფასება.</p>
              {hirerActionError ? (
                <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{hirerActionError}</p>
              ) : null}
              {hirerApplications.length === 0 ? (
                <p className="text-sm text-slate-500">ჯერჯერობით განმცხადებლები არ არიან.</p>
              ) : (
                <div className="space-y-3">
                  {hirerApplications.map((item) => (
                    <div
                      key={item.applicationId}
                      className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[#1B2B4B]">{item.freelancerName}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.jobTitle} • {formatDate(item.createdAt)} • {statusLabel(item.status)}
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
                              className="rounded-lg bg-[#1B2B4B] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-50"
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
                        {item.status === "accepted" && item.jobStatus === "in_progress" ? (
                          <button
                            type="button"
                            disabled={!item.freelancerUserId}
                            onClick={() => openCompleteReviewModal(item)}
                            className="rounded-lg border border-[#D4A843] bg-amber-50 px-3 py-1.5 text-xs font-semibold text-[#1B2B4B] transition hover:bg-[#D4A843]/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            დასრულება და შეფასება
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {reviewModalItem ? (
              <div
                role="dialog"
                aria-modal="true"
                className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) setReviewModalItem(null)
                }}
              >
                <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                  <h3 className="text-lg font-bold text-[#1B2B4B]">სამუშაოს დასრულება</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {reviewModalItem.jobTitle} — {reviewModalItem.freelancerName}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">შეაფასე ფრილანსერი 1-დან 5 ვარსკვლაურამდე და დაწერე მოკლე კომენტარი (მინ. 10 სიმბოლო).</p>

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

                  {reviewError ? <p className="mt-2 text-sm text-red-600">{reviewError}</p> : null}

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={reviewSubmitting}
                      onClick={() => void submitCompleteReview()}
                      className="flex-1 rounded-lg bg-[#1B2B4B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-60"
                    >
                      {reviewSubmitting ? "ინახება…" : "დასრულება და გაგზავნა"}
                    </button>
                    <button
                      type="button"
                      disabled={reviewSubmitting}
                      onClick={() => setReviewModalItem(null)}
                      className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      გაუქმება
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
      </main>
    </div>
  )
}
