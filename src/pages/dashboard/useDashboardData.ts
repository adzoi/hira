import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { subscribeToDashboardMessaging } from "../../lib/dashboardMessagingRealtime.ts"
import { isSupabaseConfigured, supabase } from "../../lib/supabase"
import {
  fetchDashboard,
  fetchHirerReviewedApplicationIds,
  mapFreelancerCompletedPlatformJobRows,
  type DashboardSnapshot,
} from "../../lib/queries/fetchDashboard.ts"
import type { FreelancerCompletedPlatformJob } from "../../lib/queries/fetchDashboard.ts"
import { queryErrorMessage } from "../../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../../lib/queryKeys.ts"
import { useTranslation } from "../../i18n/LocaleContext.tsx"
import {
  embedJoinRow,
  fetchHirerDashboardSection,
  mapServiceInquiryRowsForFreelancer,
  mapServiceInquiryRowsForHirer,
  type CancelRequestedByRole,
  type DashboardFreelancerInquiry,
  type DashboardHirerInquiry,
  type FreelancerHirerReviewRow,
  type FreelancerPendingJobOffer,
  type FreelancerProfileRow,
  type HirerApplicationRow,
  type HirerProfileRow,
  type JobRow,
  type ProfileRow,
  type ServiceDraft,
} from "./dashboardShared.ts"

/** Everything the dashboard loads from the server, plus the reloaders both role views use. */
export function useDashboardData() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [dashboardUserId, setDashboardUserId] = useState("")
  const [dashboardUserResolved, setDashboardUserResolved] = useState(false)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [freelancerProfile, setFreelancerProfile] = useState<FreelancerProfileRow | null>(null)
  const [hirerProfile, setHirerProfile] = useState<HirerProfileRow | null>(null)
  const [hirerCompletedJobsCount, setHirerCompletedJobsCount] = useState(0)
  const [myJobs, setMyJobs] = useState<JobRow[]>([])
  const [jobApplicationsByJobId, setJobApplicationsByJobId] = useState<Record<string, number>>({})
  const [hirerApplications, setHirerApplications] = useState<HirerApplicationRow[]>([])

  const [serviceDrafts, setServiceDrafts] = useState<ServiceDraft[]>([])
  const [initialServiceIds, setInitialServiceIds] = useState<string[]>([])

  const [initialServicesSnapshot, setInitialServicesSnapshot] = useState("[]")
  /** Distinct logged-in hirers who visited this freelancer profile (via RPC). */
  const [hirerProfileViewerCount, setHirerProfileViewerCount] = useState(0)
  /** All profile visit events, including anonymous visitors. */
  const [overallProfileVisitCount, setOverallProfileVisitCount] = useState(0)
  /** Row count in `completed_jobs` for this freelancer (source of truth for the stat card). */
  const [freelancerCompletedJobsCount, setFreelancerCompletedJobsCount] = useState(0)
  const [freelancerHirerReviewQueue, setFreelancerHirerReviewQueue] = useState<FreelancerHirerReviewRow[]>([])

  const [freelancerListingInquiries, setFreelancerListingInquiries] = useState<DashboardFreelancerInquiry[]>([])
  const [freelancerCompletedPlatformJobs, setFreelancerCompletedPlatformJobs] = useState<FreelancerCompletedPlatformJob[]>(
    [],
  )
  const [freelancerPendingJobOffers, setFreelancerPendingJobOffers] = useState<FreelancerPendingJobOffer[]>([])

  const [hirerListingInquiries, setHirerListingInquiries] = useState<DashboardHirerInquiry[]>([])

  const [hirerReviewedListingInquiryIds, setHirerReviewedListingInquiryIds] = useState<Record<string, true>>({})
  const [hirerReviewedJobApplicationIds, setHirerReviewedJobApplicationIds] = useState<Record<string, true>>({})

  const [dashFollowersCount, setDashFollowersCount] = useState(0)
  const [dashFollowingCount, setDashFollowingCount] = useState(0)

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

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setDashboardUserId(user?.id ?? "")
      setDashboardUserResolved(true)
    })
  }, [])

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
      if (!supabase || !profile?.id) {
        setHirerReviewedJobApplicationIds({})
        return
      }
      try {
        setHirerReviewedJobApplicationIds(await fetchHirerReviewedApplicationIds(supabase, profile.id, applications))
      } catch {
        setHirerReviewedJobApplicationIds({})
      }
    },
    [profile?.id, supabase],
  )

  const {
    data: snapshot,
    dataUpdatedAt,
    isLoading: queryLoading,
    isError: dashboardQueryIsError,
    error: dashboardQueryError,
  } = useQuery({
    queryKey: queryKeys.dashboard(dashboardUserId || "pending"),
    queryFn: () => fetchDashboard(navigate, supabaseAny),
    enabled: Boolean(dashboardUserId) && isSupabaseConfigured,
  })

  // The role views edit these fields locally (drafts, realtime reloads), so they live in state.
  // Copy each new snapshot in during render, so a remount shows cached data on its first paint.
  const [hydratedAt, setHydratedAt] = useState(0)
  if (snapshot && dataUpdatedAt !== hydratedAt) {
    setHydratedAt(dataUpdatedAt)
    applySnapshot(snapshot)
  }

  function applySnapshot(next: DashboardSnapshot) {
    setProfile(next.profile)
    setFreelancerProfile(next.freelancerProfile)
    setHirerProfile(next.hirerProfile)
    setDashFollowersCount(next.followersCount)
    setDashFollowingCount(next.followingCount)
    setFreelancerListingInquiries(next.freelancerListingInquiries)
    setFreelancerCompletedJobsCount(next.freelancerCompletedJobsCount)
    setFreelancerHirerReviewQueue(next.freelancerHirerReviewQueue)
    setFreelancerCompletedPlatformJobs(next.freelancerCompletedPlatformJobs)
    setFreelancerPendingJobOffers(next.freelancerPendingJobOffers)
    setHirerProfileViewerCount(next.hirerProfileViewerCount)
    setOverallProfileVisitCount(next.overallProfileVisitCount)
    setServiceDrafts(next.serviceDrafts)
    setInitialServicesSnapshot(next.initialServicesSnapshot)
    setInitialServiceIds(next.initialServiceIds)
    setMyJobs(next.myJobs)
    setHirerApplications(next.hirerApplications)
    setJobApplicationsByJobId(next.jobApplicationsByJobId)
    setHirerCompletedJobsCount(next.hirerCompletedJobsCount)
    setHirerListingInquiries(next.hirerListingInquiries)
    setHirerReviewedListingInquiryIds(next.hirerReviewedListingInquiryIds)
    setHirerReviewedJobApplicationIds(next.hirerReviewedJobApplicationIds)
  }

  const loading = (isSupabaseConfigured && !dashboardUserResolved) || queryLoading || (Boolean(snapshot) && !profile)
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

  return {
    dashboardUserId,
    setDashboardUserId,
    error,
    setError,
    successMessage,
    setSuccessMessage,
    profile,
    setProfile,
    freelancerProfile,
    setFreelancerProfile,
    hirerProfile,
    setHirerProfile,
    hirerCompletedJobsCount,
    setHirerCompletedJobsCount,
    myJobs,
    setMyJobs,
    jobApplicationsByJobId,
    setJobApplicationsByJobId,
    hirerApplications,
    setHirerApplications,
    serviceDrafts,
    setServiceDrafts,
    initialServiceIds,
    setInitialServiceIds,
    initialServicesSnapshot,
    setInitialServicesSnapshot,
    hirerProfileViewerCount,
    setHirerProfileViewerCount,
    overallProfileVisitCount,
    setOverallProfileVisitCount,
    freelancerCompletedJobsCount,
    setFreelancerCompletedJobsCount,
    freelancerHirerReviewQueue,
    setFreelancerHirerReviewQueue,
    freelancerListingInquiries,
    setFreelancerListingInquiries,
    freelancerCompletedPlatformJobs,
    setFreelancerCompletedPlatformJobs,
    freelancerPendingJobOffers,
    setFreelancerPendingJobOffers,
    hirerListingInquiries,
    setHirerListingInquiries,
    hirerReviewedListingInquiryIds,
    setHirerReviewedListingInquiryIds,
    hirerReviewedJobApplicationIds,
    setHirerReviewedJobApplicationIds,
    dashFollowersCount,
    setDashFollowersCount,
    dashFollowingCount,
    setDashFollowingCount,
    notifyUser,
    supabaseAny,
    reloadHirerSection,
    loadHirerApplicationReviewedFlags,
    displayError,
    reloadFreelancerListingInquiries,
    reloadHirerListingInquiries,
    reloadFreelancerPendingJobOffers,
    loading,
  }
}

export type DashboardData = ReturnType<typeof useDashboardData>
