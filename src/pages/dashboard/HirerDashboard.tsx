import { useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import type { FollowModalTab } from "../../components/FollowListsModal.tsx"
import VipCoinsButton from "../../components/VipCoinsButton.tsx"
import ReferralCard from "../../components/ReferralCard.tsx"
import WelcomeChecklist from "../../components/WelcomeChecklist.tsx"
import CompareApplicantsModal from "../../components/CompareApplicantsModal.tsx"
import HirerHero from "./HirerHero.tsx"
import StaleJobBanner from "./StaleJobBanner.tsx"
import { isStaleJob } from "./staleJobs.ts"
import { supabase } from "../../lib/supabase"
import { jobVacancyStats } from "../../lib/jobVacancies.ts"
import { assertField, validateReviewComment } from "../../lib/validation.ts"
import { useTranslation } from "../../i18n/LocaleContext.tsx"
import {
  formatSupabaseErr,
  isUniqueOrDuplicateJobCompletion,
  listingStatusAfterHirerMarksDone,
  listingInquiryStatusLabel,
  formatDate,
  formatBudget,
  statusLabel,
  withinHirerListingOfferRange,
  withinHirerApplicantRange,
  isHirerListingOfferAcceptedStatus,
  isHirerApplicantAcceptedStatus,
  hirerAcceptedApplicantShowsJobActions,
  type ProfileRow,
  type DashboardHirerInquiry,
  type HirerListingOfferStatusTab,
  type HirerListingOfferTimeRange,
  type HirerApplicantStatusTab,
  type HirerApplicantTimeRange,
  type HirerApplicationRow,
} from "./dashboardShared.ts"
import type { DashboardData } from "./useDashboardData.ts"

type Props = {
  data: DashboardData
  onOpenFollowList: (tab: FollowModalTab) => void
}

/** Hirer home: applicants first, then jobs, listing offers and ongoing work. */
export default function HirerDashboard({ data, onOpenFollowList }: Props) {
  const { t } = useTranslation()
  const {
    setSuccessMessage,
    hirerProfile,
    setHirerCompletedJobsCount,
    myJobs,
    setMyJobs,
    jobApplicationsByJobId,
    setJobApplicationsByJobId,
    hirerApplications,
    setHirerApplications,
    hirerListingInquiries,
    hirerReviewedListingInquiryIds,
    setHirerReviewedListingInquiryIds,
    hirerReviewedJobApplicationIds,
    setHirerReviewedJobApplicationIds,
    dashFollowersCount,
    dashFollowingCount,
    notifyUser,
    supabaseAny,
    reloadHirerSection,
    reloadHirerListingInquiries,
  } = data
  // The shell renders role views only after the profile has loaded.
  const profile = data.profile as ProfileRow
  const [searchParams] = useSearchParams()
  const justJoined = searchParams.get("welcome") === "1"
  const [compareJobId, setCompareJobId] = useState<string | null>(null)
  const tabsRef = useRef<HTMLDivElement | null>(null)

  const [jobDeletingId, setJobDeletingId] = useState<string | null>(null)
  const [jobsActionError, setJobsActionError] = useState("")
  const [hirerActionError, setHirerActionError] = useState("")
  const [applicationBusyId, setApplicationBusyId] = useState<string | null>(null)
  const [reviewModalItem, setReviewModalItem] = useState<HirerApplicationRow | null>(null)
  const [reviewStars, setReviewStars] = useState(5)
  const [reviewComment, setReviewComment] = useState("")
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState("")

  const [hirerListingOfferStatusTab, setHirerListingOfferStatusTab] = useState<HirerListingOfferStatusTab>("all")
  const [hirerListingOfferTimeRange, setHirerListingOfferTimeRange] = useState<HirerListingOfferTimeRange>("7d")
  const [hirerApplicantStatusTab, setHirerApplicantStatusTab] = useState<HirerApplicantStatusTab>("pending")
  const [hirerApplicantTimeRange, setHirerApplicantTimeRange] = useState<HirerApplicantTimeRange>("7d")

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

  const deleteHirerListingInquiry = async (inquiryId: string) => {
    if (!supabase) return
    if (!window.confirm("ნამდვილად გსურს შეთავაზების წაშლა?")) return
    setListingInquiryDeleteBusyId(inquiryId)
    try {
      const { error } = await supabaseAny
        .from("service_inquiries")
        .update({ deleted_by_hirer: true })
        .eq("id", inquiryId)
      if (error) throw error
      await reloadHirerListingInquiries()
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
      // One transaction server-side: accept, bump accepted_count / close the job, reject the rest.
      const { error: acceptErr } = await supabaseAny.rpc("accept_job_application", {
        p_application_id: item.applicationId,
      })
      if (acceptErr) throw new Error(acceptErr.message)

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
        .update({ deleted_by_hirer: true })
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
        .eq("freelancer_profile_id", reviewModalItem.freelancerProfileId)
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
              .eq("freelancer_profile_id", reviewModalItem.freelancerProfileId)
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


  /** Jobs with at least two active applicants - where side-by-side comparison helps. */
  const compareableJobs = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of hirerApplications) {
      if (a.status === "pending" || a.status === "accepted") counts.set(a.jobId, (counts.get(a.jobId) ?? 0) + 1)
    }
    return myJobs
      .filter((j) => (counts.get(j.id) ?? 0) >= 2)
      .map((j) => ({ id: j.id, title: j.title, count: counts.get(j.id) ?? 0 }))
  }, [hirerApplications, myJobs])

  const showApplicantsTab = () => {
    setHirerDashboardTab("applicants")
    setHirerApplicantStatusTab("pending")
    setHirerApplicantTimeRange("all")
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  /** Compare modal acts by application id; the dashboard handlers take the full row. */
  const runApplicationAction = async (applicationId: string, action: (item: HirerApplicationRow) => Promise<void>) => {
    const item = hirerApplications.find((a) => a.applicationId === applicationId)
    if (item) await action(item)
  }

  const markJobClosed = (jobId: string) => {
    setMyJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: "closed" } : j)))
  }

  const markJobKeptOpen = (jobId: string) => {
    const now = new Date().toISOString()
    setMyJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, stale_clock_at: now, stale_reminders_sent: 0 } : j)))
  }

  return (
          <section className="space-y-6">
            <HirerHero
              name={profile.full_name}
              followerCount={dashFollowersCount}
              followingCount={dashFollowingCount}
              onOpenFollowList={onOpenFollowList}
              myJobs={myJobs}
              applications={hirerApplications}
              onCompare={setCompareJobId}
              onShowApplicants={showApplicantsTab}
            />

            <WelcomeChecklist
              role="hirer"
              userId={profile.id}
              avatarUrl={profile.avatar_url}
              createdAt={profile.created_at}
              hirerProfileId={hirerProfile?.id ?? null}
              hirerHasCompanyDetails={Boolean(hirerProfile?.company_name?.trim() && hirerProfile?.description?.trim())}
              justJoined={justJoined}
            />

            <div ref={tabsRef} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
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
                        {(jobApplicationsByJobId[job.id] ?? 0) > 0 ? (
                          <button
                            type="button"
                            onClick={() => setCompareJobId(job.id)}
                            className="rounded-lg bg-[#0088FF] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#006ACC]"
                          >
                            {t("compare.openButton", { count: jobApplicationsByJobId[job.id] ?? 0 })}
                          </button>
                        ) : null}
                      </div>
                      {isStaleJob(job, jobApplicationsByJobId[job.id] ?? 0) ? (
                        <StaleJobBanner job={job} onClosed={markJobClosed} onKeptOpen={markJobKeptOpen} />
                      ) : null}
                      {job.status === "open" ? (
                        <VipCoinsButton compact kind="job" id={job.id} vipExpiresAt={job.is_vip ? job.vip_expires_at : null} />
                      ) : null}
                    </div>
                    )
                  })}
                </div>
              )}
            </div>
            ) : null}

            {hirerDashboardTab === "ongoing" ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                {hirerActionError ? (
                  <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{hirerActionError}</p>
                ) : null}
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
              {compareableJobs.length > 0 ? (
                <div className="mb-4 rounded-lg border border-[#0088FF]/20 bg-[#E8F4FF] p-3">
                  <p className="text-sm font-semibold text-[#1B2B4B]">{t("compare.pickJob")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {compareableJobs.map((job) => (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => setCompareJobId(job.id)}
                        className="max-w-full truncate rounded-full border border-[#0088FF] bg-white px-3 py-1 text-xs font-semibold text-[#0088FF] transition hover:bg-[#0088FF] hover:text-white"
                      >
                        {job.title} · {job.count}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
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
                    {hirerListingReviewModal.listingTitle} - {hirerListingReviewModal.freelancerName}
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
                        {reviewModalItem.jobTitle} - {reviewModalItem.freelancerName}
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
                      className="flex-1 rounded-lg bg-[#1B2B4B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-60"
                    >
                      {reviewSubmitting ? "ინახება…" : reviewModalAlreadyReviewed ? "დასრულება" : "შეფასება და დასრულება"}
                    </button>
                    {reviewModalAlreadyReviewed ? null : (
                      <button
                        type="button"
                        disabled={reviewSubmitting}
                        onClick={() => void closeHirerCompleteModalWithSkip()}
                        className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        დასრულება შეფასების გარეშე
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="space-y-4 pt-2">
              <h3 className="text-lg font-semibold text-[#1B2B4B]">{t("dashHome.yourStats")}</h3>
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

              <ReferralCard />
            </div>

            {compareJobId ? (
              <CompareApplicantsModal
                jobId={compareJobId}
                onClose={() => setCompareJobId(null)}
                onAccept={(id) => runApplicationAction(id, acceptApplication)}
                onReject={(id) => runApplicationAction(id, rejectApplication)}
              />
            ) : null}
          </section>
  )
}
