import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import type { FollowModalTab } from "../../components/FollowListsModal.tsx"
import ProfileCompletenessCard from "../../components/ProfileCompletenessCard.tsx"
import VipCoinsButton from "../../components/VipCoinsButton.tsx"
import ReferralCard from "../../components/ReferralCard.tsx"
import WelcomeChecklist from "../../components/WelcomeChecklist.tsx"
import ShareProfileCard from "../../components/ShareProfileCard.tsx"
import FreelancerHero from "./FreelancerHero.tsx"
import { formatListingPrice, normalizeListingPriceType } from "../../lib/listingPrice.ts"
import { supabase } from "../../lib/supabase"
import { assertField, validateReviewComment } from "../../lib/validation.ts"
import { useTranslation } from "../../i18n/LocaleContext.tsx"
import { assertContentRateLimit, formatContentRateLimitError } from "../../lib/contentRateLimit.ts"
import {
  snapshotServices,
  formatSupabaseErr,
  listingStatusAfterFreelancerMarksDone,
  listingInquiryStatusLabel,
  formatDate,
  freelancerJobOfferStatusLabel,
  withinFreelancerJobOfferRange,
  withinFreelancerListingOfferRange,
  isFreelancerListingOfferAcceptedStatus,
  stripListingMeta,
  type ProfileRow,
  type ServiceDraft,
  type DashboardFreelancerInquiry,
  type FreelancerPendingJobOffer,
  type FreelancerJobOfferStatusTab,
  type FreelancerJobOfferTimeRange,
  type FreelancerListingOfferStatusTab,
  type FreelancerListingOfferTimeRange,
  type FreelancerHirerReviewRow,
} from "./dashboardShared.ts"
import type { DashboardData } from "./useDashboardData.ts"

type Props = {
  data: DashboardData
  onOpenFollowList: (tab: FollowModalTab) => void
}

/** Freelancer home: offers, ongoing work, services and profile growth. */
export default function FreelancerDashboard({ data, onOpenFollowList }: Props) {
  const { t } = useTranslation()
  const {
    setSuccessMessage,
    freelancerProfile,
    serviceDrafts,
    setServiceDrafts,
    initialServiceIds,
    setInitialServiceIds,
    initialServicesSnapshot,
    setInitialServicesSnapshot,
    hirerProfileViewerCount,
    overallProfileVisitCount,
    freelancerHirerReviewQueue,
    setFreelancerHirerReviewQueue,
    freelancerListingInquiries,
    freelancerCompletedPlatformJobs,
    freelancerPendingJobOffers,
    setFreelancerPendingJobOffers,
    dashFollowersCount,
    dashFollowingCount,
    notifyUser,
    supabaseAny,
    reloadFreelancerListingInquiries,
  } = data
  // The shell renders role views only after the profile has loaded.
  const profile = data.profile as ProfileRow
  const [searchParams] = useSearchParams()
  const justJoined = searchParams.get("welcome") === "1"
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const [reviewStars, setReviewStars] = useState(5)
  const [reviewComment, setReviewComment] = useState("")

  const [servicesSaving, setServicesSaving] = useState(false)
  const [servicesError, setServicesError] = useState("")
  const [servicesSuccess, setServicesSuccess] = useState("")

  const [freelancerHirerReviewModal, setFreelancerHirerReviewModal] = useState<FreelancerHirerReviewRow | null>(null)
  /** Review prompts the freelancer hid without reviewing (per browser, keyed by completed_job id). */
  const [dismissedHirerReviewIds, setDismissedHirerReviewIds] = useState<Set<string>>(() => new Set())
  const [freelancerHirerReviewSubmitting, setFreelancerHirerReviewSubmitting] = useState(false)
  const [freelancerHirerReviewError, setFreelancerHirerReviewError] = useState("")
  const [freelancerListingCompleteModal, setFreelancerListingCompleteModal] = useState<DashboardFreelancerInquiry | null>(null)
  const [freelancerListingReviewStars, setFreelancerListingReviewStars] = useState(5)
  const [freelancerListingReviewComment, setFreelancerListingReviewComment] = useState("")
  const [freelancerListingReviewSubmitting, setFreelancerListingReviewSubmitting] = useState(false)
  const [freelancerListingReviewError, setFreelancerListingReviewError] = useState("")

  const [freelancerJobOfferStatusTab, setFreelancerJobOfferStatusTab] = useState<FreelancerJobOfferStatusTab>("all")
  const [freelancerJobOfferTimeRange, setFreelancerJobOfferTimeRange] = useState<FreelancerJobOfferTimeRange>("7d")
  const [freelancerListingOfferStatusTab, setFreelancerListingOfferStatusTab] =
    useState<FreelancerListingOfferStatusTab>("pending")
  const [freelancerListingOfferTimeRange, setFreelancerListingOfferTimeRange] =
    useState<FreelancerListingOfferTimeRange>("7d")
  const [freelancerDashboardTab, setFreelancerDashboardTab] = useState<
    "listing_offers" | "job_offers" | "my_services" | "ongoing" | "completed"
  >("listing_offers")

  const [listingInquiryBusyId, setListingInquiryBusyId] = useState<string | null>(null)
  const [listingInquiryDeleteBusyId, setListingInquiryDeleteBusyId] = useState<string | null>(null)
  const [jobApplicationDeleteBusyId, setJobApplicationDeleteBusyId] = useState<string | null>(null)

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
  const hirerReviewDismissKey = profile?.id ? `hira.dismissedHirerReviews.${profile.id}` : ""
  useEffect(() => {
    if (!hirerReviewDismissKey) return
    try {
      const raw = localStorage.getItem(hirerReviewDismissKey)
      const ids = raw ? (JSON.parse(raw) as unknown) : []
      setDismissedHirerReviewIds(new Set(Array.isArray(ids) ? ids.map(String) : []))
    } catch {
      setDismissedHirerReviewIds(new Set())
    }
  }, [hirerReviewDismissKey])
  const dismissFreelancerHirerReview = (completedJobId: string) => {
    setDismissedHirerReviewIds((prev) => {
      const next = new Set(prev)
      next.add(completedJobId)
      try {
        if (hirerReviewDismissKey) localStorage.setItem(hirerReviewDismissKey, JSON.stringify([...next]))
      } catch {
        /* storage unavailable: hidden for this session only */
      }
      return next
    })
  }
  const visibleFreelancerHirerReviewQueue = useMemo(
    () => freelancerHirerReviewQueue.filter((item) => !dismissedHirerReviewIds.has(item.completedJobId)),
    [freelancerHirerReviewQueue, dismissedHirerReviewIds],
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
            : "დასრულება მონიშნულია - ელოდება დამქირავებლის დადასტურებას.",
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
          vipExpiresAt: item.is_vip ? item.vip_expires_at : null,
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

  const pendingListingOfferCount = freelancerListingInquiries.filter((q) => q.status === "pending").length

  const showListingOffersTab = () => {
    setFreelancerDashboardTab("listing_offers")
    setFreelancerListingOfferStatusTab("pending")
    setFreelancerListingOfferTimeRange("all")
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
          <section className="space-y-6">
            <FreelancerHero
              userId={profile.id}
              name={profile.full_name}
              followerCount={dashFollowersCount}
              followingCount={dashFollowingCount}
              onOpenFollowList={onOpenFollowList}
              pendingListingOffers={pendingListingOfferCount}
              onShowListingOffers={showListingOffersTab}
            />

            <WelcomeChecklist
              role="freelancer"
              userId={profile.id}
              avatarUrl={profile.avatar_url}
              createdAt={profile.created_at}
              freelancerProfileId={freelancerProfile?.id ?? null}
              freelancerSlug={freelancerProfile?.slug ?? null}
              justJoined={justJoined}
            />

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

            {visibleFreelancerHirerReviewQueue.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="text-xl font-bold text-[#1B2B4B]">დამქირავებლის შეფასება</h3>
                <p className="mt-1 text-sm text-slate-500">
                  დასრულებულ სამუშაოებზე დააფიქსირე გამოცდილება.
                </p>
                <ul className="mt-4 space-y-3">
                  {visibleFreelancerHirerReviewQueue.map((item) => (
                    <li
                      key={item.completedJobId}
                      className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#1B2B4B]">{item.jobTitle}</p>
                        <p className="mt-1 text-sm text-slate-600">{item.hirerDisplayName}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => openFreelancerHirerReviewModal(item)}
                          className="rounded-lg border border-[#D4A843] bg-amber-50 px-3 py-2 text-xs font-semibold text-[#1B2B4B] transition hover:bg-[#D4A843]/30"
                        >
                          შეფასების დაწყება
                        </button>
                        <button
                          type="button"
                          onClick={() => dismissFreelancerHirerReview(item.completedJobId)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400"
                        >
                          დამალვა
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div ref={tabsRef} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
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
                {freelancerCompletedListingInquiries.length === 0 && freelancerCompletedPlatformJobs.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">დასრულებული სამუშაოები არ არის.</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {freelancerCompletedPlatformJobs.map((job) => (
                      <li key={`done-job-${job.completedJobId}`} className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
                        <p className="font-semibold text-[#1B2B4B]">{job.jobTitle}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {job.hirerDisplayName} · {formatDate(job.completedAt)}
                        </p>
                      </li>
                    ))}
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
                      {service.id && service.isActive ? (
                        <div className="mb-3">
                          <VipCoinsButton compact kind="service" id={service.id} vipExpiresAt={service.vipExpiresAt} />
                        </div>
                      ) : null}
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
                        {freelancerListingCompleteModal.listingTitle} - {freelancerListingCompleteModal.hirerLabel}
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
                      className="flex-1 rounded-lg bg-[#1B2B4B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-60"
                    >
                      {freelancerListingReviewSubmitting ? "ინახება…" : "შეფასების გაგზავნა"}
                    </button>
                    <button
                      type="button"
                      disabled={freelancerListingReviewSubmitting}
                      onClick={() => void closeFreelancerListingCompleteWithSkip()}
                      className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      დასრულება შეფასების გარეშე
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
                        {freelancerHirerReviewModal.jobTitle} - {freelancerHirerReviewModal.hirerDisplayName}
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
            <div className="space-y-4 pt-2">
              <h3 className="text-lg font-semibold text-[#1B2B4B]">{t("dashHome.growProfile")}</h3>
              {freelancerProfile?.is_profile_complete ? (
                <ProfileCompletenessCard profile={profile} freelancerProfile={freelancerProfile} />
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
                <Link
                  to="/dashboard/stats"
                  className="flex flex-col justify-between rounded-xl border border-[#0088FF]/30 bg-[#E8F4FF] p-5 transition hover:border-[#0088FF]"
                >
                  <p className="text-sm font-semibold text-[#0088FF]">{t("stats.dashboardLinkTitle")}</p>
                  <p className="mt-2 text-xs text-slate-600">{t("stats.dashboardLinkHint")} →</p>
                </Link>
              </div>

              {freelancerProfile?.is_public && freelancerProfile.slug ? (
                <ShareProfileCard slug={freelancerProfile.slug} />
              ) : null}

              <ReferralCard />
              {freelancerProfile?.slug ? (
                <Link
                  to={`/freelancer/${encodeURIComponent(freelancerProfile.slug)}?cv=1`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 transition hover:border-[#D4A843]"
                >
                  <div>
                    <p className="font-semibold text-[#1B2B4B]">{t("profileCv.download")}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{t("profileCv.dashboardHint")}</p>
                  </div>
                  <span className="shrink-0 text-[#D4A843]">PDF →</span>
                </Link>
              ) : null}
            </div>
          </section>
  )
}
