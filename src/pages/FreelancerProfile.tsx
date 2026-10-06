import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useToast } from "../components/ui/ToastProvider.tsx"
import { countFreelancerProfileVisits } from "../lib/profileVisits.ts"
import { formatFreelancerEducationDegreeLevel } from "../lib/freelancerEducation.ts"
import { formatListingPrice } from "../lib/listingPrice.ts"
import { formatCityForDisplay } from "../lib/marketplaceFilters.ts"
import FollowListsModal, { type FollowModalTab } from "../components/FollowListsModal.tsx"
import { OptimizedImage } from "../components/OptimizedImage.tsx"
import SaveBookmarkButton from "../components/SaveBookmarkButton.tsx"
import { ViewCountEyeIcon } from "../components/ViewCountEyeIcon.tsx"
import { countFollowers, countFollowing, followUser, isFollowing, unfollowUser } from "../lib/follows.ts"
import { avatarImageUrl, jobOrServiceImageDisplayUrl } from "../lib/storageImageUrl.ts"
import SocialProfileLinks, { hasSocialProfileLinks } from "../components/SocialProfileLinks.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import ProfilePendingOffers from "../components/ProfilePendingOffers.tsx"
import {
  acceptJobApplication,
  fetchPendingApplicationsFromFreelancer,
  rejectJobApplication,
  type ProfileJobApplication,
} from "../lib/profileOffers.ts"
import ShareButtons from "../components/ShareButtons.tsx"
import SimilarFreelancers from "../components/SimilarFreelancers.tsx"
import StartConversationButton from "../components/StartConversationButton.tsx"
import {
  fetchFreelancerProfile,
  type EducationData,
  type ExperienceData,
  type FreelancerData,
  type PortfolioData,
  type ProfileData,
  type PublicCompletedPlatformJob,
  type ReviewData,
  type ServiceData,
  type SkillData,
} from "../lib/queries/fetchFreelancerProfile.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { validateCvUpload } from "../lib/uploadValidation.ts"
import { createCvSignedUrl, cvStoragePath } from "../lib/cvStorage.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { SITE_BASE_URL, usePageMeta } from "../lib/usePageMeta.tsx"
import { buildPersonStructuredData, JsonLd } from "../lib/structuredData.tsx"
import { pickListingDescription, pickListingTitle } from "../lib/listingLocale.ts"

function getInitials(fullName: string) {
  const parts = fullName.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "ფ"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("ka-GE")
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

function CalendarOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function BriefcaseOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 11V7a3 3 0 0 1 6 0v4" />
      <rect x="2" y="9" width="20" height="12" rx="2" />
      <path d="M6 11h12" />
    </svg>
  )
}

const tagChipClass =
  "inline-flex max-w-full items-center rounded-full border border-[#D1D5DB] bg-white px-2.5 py-0.5 text-xs font-medium text-[#374151] [overflow-wrap:anywhere]"

const primaryBtnClass =
  "inline-flex h-9 min-h-9 shrink-0 items-center justify-center rounded-lg bg-[#0088FF] px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#006ACC] disabled:pointer-events-none disabled:opacity-60"

const outlineBtnClass =
  "inline-flex h-9 min-h-9 shrink-0 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white px-4 text-sm font-medium text-[#374151] transition-colors duration-150 hover:bg-[#F9FAFB] disabled:pointer-events-none disabled:opacity-60"

const metaPillClass =
  "inline-flex w-fit max-w-full min-w-0 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[#D1D5DB] bg-white px-2.5 py-0.5 text-xs font-medium text-[#374151]"

export default function FreelancerProfilePage() {
  const { t, locale } = useTranslation()
  const { pushToast } = useToast()
  const navigate = useNavigate()
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    data: profileData,
    isLoading: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.freelancerProfile(slug ?? ""),
    queryFn: () => fetchFreelancerProfile(slug!),
    enabled: Boolean(slug),
  })
  const error = isError ? queryErrorMessage(queryError, "მონაცემები ვერ ჩაიტვირთა.") : ""
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [cvSignedUrl, setCvSignedUrl] = useState<string | null>(null)
  const [freelancer, setFreelancer] = useState<FreelancerData | null>(null)
  const [skills, setSkills] = useState<SkillData[]>([])
  const [services, setServices] = useState<ServiceData[]>([])
  const [reviews, setReviews] = useState<ReviewData[]>([])
  const [experience, setExperience] = useState<ExperienceData[]>([])
  const [education, setEducation] = useState<EducationData[]>([])
  const [portfolioItems, setPortfolioItems] = useState<PortfolioData[]>([])
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)
  const [avatarLightboxOpen, setAvatarLightboxOpen] = useState(false)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [contactLoading, setContactLoading] = useState(false)
  const [profileTab, setProfileTab] = useState<"services" | "bio" | "reviews">("services")
  /** Set only when logged-in viewer owns this freelancer profile (RLS-aligned). */
  const [ownerVisitCount, setOwnerVisitCount] = useState<number | null>(null)
  const [publicCompletedJobs, setPublicCompletedJobs] = useState<PublicCompletedPlatformJob[]>([])
  const [publicCompletedListings, setPublicCompletedListings] = useState<{ title: string; completedAt: string }[]>([])
  const [viewerIsOwner, setViewerIsOwner] = useState(false)
  const [publicCvSlug, setPublicCvSlug] = useState<string | null>(null)
  const [cvUploading, setCvUploading] = useState(false)
  const ownerCvInputRef = useRef<HTMLInputElement | null>(null)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [followListsModalOpen, setFollowListsModalOpen] = useState(false)
  const [followListsModalTab, setFollowListsModalTab] = useState<FollowModalTab>("followers")
  const [followButtonMode, setFollowButtonMode] = useState<"hidden" | "loading" | "guest" | "follow" | "unfollow">("hidden")
  const [followBusy, setFollowBusy] = useState(false)
  const [viewerUserId, setViewerUserId] = useState<string | null>(null)
  const [viewerHirerProfileId, setViewerHirerProfileId] = useState<string | null>(null)
  const [pendingJobApplications, setPendingJobApplications] = useState<ProfileJobApplication[]>([])
  const [applicationOfferBusyId, setApplicationOfferBusyId] = useState<string | null>(null)

  const profileAvatarDisplayUrl = useMemo(() => {
    if (!profile?.avatar_url) return null
    return avatarImageUrl(supabase, profile.avatar_url) ?? profile.avatar_url
  }, [profile?.avatar_url])

  const canRespondToApplications = Boolean(
    freelancer?.id && viewerHirerProfileId && viewerUserId && !viewerIsOwner,
  )
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return

    const client = supabase
    let cancelled = false

    const readSession = async () => {
      const {
        data: { session },
      } = await client.auth.getSession()
      if (cancelled) return
      const uid = session?.user?.id ?? null
      setViewerUserId(uid)
      if (!uid) {
        setViewerHirerProfileId(null)
        return
      }
      const { data: hp } = await client.from("hirer_profiles").select("id").eq("user_id", uid).maybeSingle()
      if (!cancelled) setViewerHirerProfileId(hp?.id ?? null)
    }

    void readSession()
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      void readSession()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !canRespondToApplications || !freelancer?.id || !viewerHirerProfileId) {
      setPendingJobApplications([])
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const apps = await fetchPendingApplicationsFromFreelancer(
          supabase,
          viewerHirerProfileId,
          freelancer.id,
        )
        if (!cancelled) setPendingJobApplications(apps)
      } catch {
        if (!cancelled) setPendingJobApplications([])
      }
    })()

    return () => {
      cancelled = true
    }
  }, [canRespondToApplications, freelancer?.id, viewerHirerProfileId])

  useEffect(() => {
    if (!profileData) {
      setProfile(null)
      setFreelancer(null)
      setSkills([])
      setServices([])
      setReviews([])
      setExperience([])
      setEducation([])
      setPortfolioItems([])
      setPublicCompletedJobs([])
      setPublicCompletedListings([])
      setViewerIsOwner(false)
      setPublicCvSlug(null)
      return
    }
    setProfile(profileData.profile)
    setFreelancer(profileData.freelancer)
    setSkills(profileData.skills)
    setServices(profileData.services)
    setReviews(profileData.reviews)
    setExperience(profileData.experience)
    setEducation(profileData.education)
    setPortfolioItems(profileData.portfolioItems)
    setPublicCompletedJobs(profileData.publicCompletedJobs)
    setPublicCompletedListings(profileData.publicCompletedListings)
    setViewerIsOwner(profileData.viewerIsOwner)
    setPublicCvSlug(profileData.publicCvSlug)
  }, [profileData])

  useEffect(() => {
    if (!freelancer || !isSupabaseConfigured || !supabase) {
      setOwnerVisitCount(null)
      return
    }

    const client = supabase
    let cancelled = false

    const loadVisitCountIfOwner = async () => {
      const {
        data: { session },
      } = await client.auth.getSession()
      if (!session?.user?.id || session.user.id !== freelancer.user_id) {
        if (!cancelled) setOwnerVisitCount(null)
        return
      }
      const n = await countFreelancerProfileVisits(freelancer.id)
      if (!cancelled) setOwnerVisitCount(n)
    }

    void loadVisitCountIfOwner()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      void loadVisitCountIfOwner()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [freelancer?.id, freelancer?.user_id])

  const showContactFlag = searchParams.get("showContact") === "1"

  useEffect(() => {
    if (!showContactFlag || !freelancer || !isSupabaseConfigured || !supabase) return

    let cancelled = false

    ;(async () => {
      const { data: sessionPayload } = await supabase.auth.getSession()
      if (cancelled) return

      const next = new URLSearchParams(searchParams)
      next.delete("showContact")
      setSearchParams(next, { replace: true })

      if (!sessionPayload.session) return

      const { data: row, error: fetchError } = await supabase
        .rpc("get_profile_contact", { p_user_id: freelancer.user_id })
        .maybeSingle()

      if (cancelled || fetchError || !row) return

      const phoneVal = row.phone !== undefined && row.phone !== null ? String(row.phone).trim() : ""
      const emailVal = row.email !== undefined && row.email !== null ? String(row.email).trim() : ""

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              phone: (phoneVal || prev.phone) ?? null,
              email: (emailVal || prev.email) ?? null,
            }
          : prev,
      )

      if (phoneVal || emailVal) {
        setContactModalOpen(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [showContactFlag, freelancer?.id, searchParams, setSearchParams])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !profile?.id) {
      setFollowerCount(0)
      setFollowingCount(0)
      setFollowButtonMode("hidden")
      return
    }

    let cancelled = false

    ;(async () => {
      if (viewerIsOwner) setFollowButtonMode("hidden")

      try {
        const [n, nf] = await Promise.all([countFollowers(profile.id), countFollowing(profile.id)])
        if (cancelled) return
        setFollowerCount(Number.isFinite(n) ? n : 0)
        setFollowingCount(Number.isFinite(nf) ? nf : 0)
      } catch {
        if (!cancelled) {
          setFollowerCount(0)
          setFollowingCount(0)
        }
      }

      if (viewerIsOwner || cancelled) return

      setFollowButtonMode("loading")
      try {
        const { data: sessionPayload } = await supabase.auth.getSession()
        if (!sessionPayload.session?.user?.id) {
          if (!cancelled) setFollowButtonMode("guest")
          return
        }
        const follows = await isFollowing(profile.id)
        if (cancelled) return
        setFollowButtonMode(follows ? "unfollow" : "follow")
      } catch {
        if (!cancelled) setFollowButtonMode("guest")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [profile?.id, viewerIsOwner])

  const reloadPendingJobApplications = async () => {
    if (!supabase || !freelancer?.id || !viewerHirerProfileId) {
      setPendingJobApplications([])
      return
    }
    try {
      const apps = await fetchPendingApplicationsFromFreelancer(
        supabase,
        viewerHirerProfileId,
        freelancer.id,
      )
      setPendingJobApplications(apps)
    } catch {
      setPendingJobApplications([])
    }
  }

  const handleAcceptJobApplication = async (offer: ProfileJobApplication) => {
    if (!supabase || !viewerHirerProfileId) return
    setApplicationOfferBusyId(offer.applicationId)
    try {
      await acceptJobApplication(supabase, offer, viewerHirerProfileId)
      pushToast({ type: "success", message: "განმცხადებელი მიღებულია." })
      await reloadPendingJobApplications()
    } catch (e) {
      pushToast({
        type: "error",
        message: e instanceof Error ? e.message : "შეცდომა მოხდა.",
      })
    } finally {
      setApplicationOfferBusyId(null)
    }
  }

  const handleRejectJobApplication = async (offer: ProfileJobApplication) => {
    if (!supabase) return
    if (!window.confirm("ნამდვილად გსურს ამ განმცხადებლის უარყოფა?")) return
    setApplicationOfferBusyId(offer.applicationId)
    try {
      await rejectJobApplication(supabase, offer)
      pushToast({ type: "info", message: "განმცხადებელი უარყოფილია." })
      await reloadPendingJobApplications()
    } catch (e) {
      pushToast({
        type: "error",
        message: e instanceof Error ? e.message : "შეცდომა მოხდა.",
      })
    } finally {
      setApplicationOfferBusyId(null)
    }
  }

  const handleFollowToggle = async () => {
    if (!supabase || !profile?.id || viewerIsOwner || followBusy) return

    const path = `/freelancer/${encodeURIComponent(slug ?? "")}`
    if (followButtonMode === "guest") {
      navigate(`/login?reason=follow&redirect=${encodeURIComponent(path)}`)
      return
    }

    if (followButtonMode !== "follow" && followButtonMode !== "unfollow") return

    setFollowBusy(true)
    try {
      if (followButtonMode === "follow") {
        await followUser(profile.id)
        setFollowButtonMode("unfollow")
        setFollowerCount((c) => Math.max(0, (Number.isFinite(c) ? c : 0) + 1))
        pushToast({ type: "success", message: "გამოწერა დასრულდა." })
      } else {
        await unfollowUser(profile.id)
        setFollowButtonMode("follow")
        setFollowerCount((c) => Math.max(0, (Number.isFinite(c) ? c : 0) - 1))
        pushToast({ type: "info", message: "გამოწერა გაუქმდა." })
      }
    } catch (e) {
      pushToast({
        type: "error",
        message: e instanceof Error ? e.message : "დაფიქსირდა შეცდომა.",
      })
    } finally {
      setFollowBusy(false)
    }
  }

  const openContactModal = async () => {
    if (!isSupabaseConfigured || !supabase || !freelancer || !slug) return

    const { data: sessionPayload } = await supabase.auth.getSession()
    if (!sessionPayload.session) {
      const path = `/freelancer/${encodeURIComponent(slug)}`
      navigate(`/login?reason=contact&redirect=${encodeURIComponent(path)}`)
      return
    }

    setContactLoading(true)
    try {
      const { data: row, error: fetchError } = await supabase
        .rpc("get_profile_contact", { p_user_id: freelancer.user_id })
        .maybeSingle()

      if (fetchError || !row) {
        pushToast({
          type: "error",
          message: "საკონტაქტო მონაცემები ვერ ჩაიტვირთა",
        })
        return
      }

      const phoneVal = row.phone !== undefined && row.phone !== null ? String(row.phone).trim() : ""
      const emailVal = row.email !== undefined && row.email !== null ? String(row.email).trim() : ""

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              phone: (phoneVal || prev.phone) ?? null,
              email: (emailVal || prev.email) ?? null,
            }
          : prev,
      )

      if (!phoneVal && !emailVal) {
        pushToast({ type: "info", message: "ეს ფრილანსერი კონტაქტს ჯერ არ აუზუსტებია." })
        return
      }

      setContactModalOpen(true)
    } finally {
      setContactLoading(false)
    }
  }

  const copyClip = async (value: string, label: string) => {
    if (!value.trim()) return
    await navigator.clipboard.writeText(value)
    pushToast({ type: "info", message: `${label} კოპირებულია` })
  }

  useEffect(() => {
    const profileId = profile?.id
    if (!supabase || !profileId || !profile?.cv_url) {
      setCvSignedUrl(null)
      return
    }
    let cancelled = false
    void createCvSignedUrl(supabase, profileId).then((url) => {
      if (!cancelled) setCvSignedUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [profile?.id, profile?.cv_url])

  const copyCvLink = async () => {
    if (cvSignedUrl) {
      await navigator.clipboard.writeText(cvSignedUrl)
      pushToast({ type: "info", message: "CV-ის ბმული კოპირებულია" })
      return
    }
    if (publicCvSlug) {
      const url = `${window.location.origin}/cv/${encodeURIComponent(publicCvSlug)}`
      await navigator.clipboard.writeText(url)
      pushToast({ type: "info", message: "CV-ის ბმული კოპირებულია" })
    }
  }

  const handleOwnerCvUpload = async (file: File) => {
    if (!viewerIsOwner || !supabase || !profile) return
    const uploadCheck = validateCvUpload(file)
    if (!uploadCheck.ok) {
      pushToast({ type: "error", message: uploadCheck.message })
      return
    }
    setCvUploading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || user.id !== profile.id) {
        pushToast({ type: "error", message: "მხოლოდ პროფილის მფლობელს შეუძლია CV ატვირთოს." })
        return
      }

      const filePath = cvStoragePath(user.id)
      const { error: uploadError } = await supabase.storage.from("cvs").upload(filePath, file, { upsert: true })
      if (uploadError) throw uploadError

      const { error: updateError } = await supabase.from("profiles").update({ cv_url: filePath }).eq("id", user.id)
      if (updateError) throw updateError

      setProfile((prev) => (prev ? { ...prev, cv_url: filePath } : prev))
      setCvSignedUrl(await createCvSignedUrl(supabase, user.id))
      pushToast({ type: "success", message: "CV დამატებულია პროფილზე." })
    } catch (e) {
      pushToast({ type: "error", message: e instanceof Error ? e.message : "CV ატვირთვა ვერ მოხერხდა." })
    } finally {
      setCvUploading(false)
    }
  }

  const completedWorkHiddenPublic = freelancer ? freelancer.show_completed_work_on_public_profile === false : false
  const completedWorkHasRows = publicCompletedJobs.length > 0 || publicCompletedListings.length > 0
  const completedWorkCount = publicCompletedJobs.length + publicCompletedListings.length
  void completedWorkHiddenPublic
  void completedWorkHasRows

  const profileName = profile?.full_name?.trim() ?? ""
  const profileBio = freelancer?.bio?.replace(/\s+/g, " ").trim() ?? ""
  const shareUrl = `${SITE_BASE_URL}/freelancer/${encodeURIComponent(slug ?? "")}`
  const pageMeta = usePageMeta(
    profileName
      ? t("freelancerProfile.metaTitleNamed", {
          name: profileName,
          title: freelancer?.professional_title?.trim() || t("freelancerProfile.title"),
        })
      : t("freelancerProfile.title"),
    profileBio ? profileBio.slice(0, 200) : t("freelancerProfile.metaDescription"),
    slug ? shareUrl : undefined,
    slug ? { image: `${SITE_BASE_URL}/og/freelancer/${encodeURIComponent(slug)}.png` } : undefined,
  )

  const personStructuredData = useMemo(() => {
    if (!profile || !freelancer || error) return null
    return buildPersonStructuredData({
      profile,
      freelancer,
      skills,
      avatarUrl: profileAvatarDisplayUrl,
    })
  }, [profile, freelancer, skills, profileAvatarDisplayUrl, error])

  return (
    <>
      {pageMeta}
      <JsonLd data={personStructuredData} />
    <div className="min-h-screen bg-[#F9FAFB] page-enter">
      <main className="mx-auto w-full min-w-0 max-w-[900px] px-6 py-10">
        {loading ? (
          <div className="grid gap-5">
            <div className="h-48 animate-pulse rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]" />
            <div className="h-11 animate-pulse rounded-full border border-[#E5E7EB] bg-white" />
            <div className="h-40 animate-pulse rounded-[14px] border border-[#E5E7EB] bg-white" />
          </div>
        ) : error || !freelancer || !profile ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error || "შეცდომა"}</div>
        ) : (
          <div className="space-y-5">
            <section className="relative min-w-0 overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white px-6 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              {!viewerIsOwner ? (
                <div className="absolute right-4 top-4 z-10">
                  <SaveBookmarkButton variant="icon" resourceType="freelancer" resourceId={freelancer.id} />
                </div>
              ) : null}

              <div className={`flex items-start gap-4 ${!viewerIsOwner ? "pr-10" : ""}`}>
                <button
                  type="button"
                  onClick={() => setAvatarLightboxOpen(true)}
                  className="group relative box-border h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full border-2 border-[#E5E7EB] bg-white p-0 transition hover:border-[#0088FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0088FF] focus-visible:ring-offset-2"
                  aria-label={t("common.enlargeAvatar")}
                >
                  {profile.avatar_url ? (
                    <OptimizedImage
                      src={profileAvatarDisplayUrl ?? profile.avatar_url}
                      alt={t("common.avatarAlt", { name: profile.full_name })}
                      width={88}
                      height={88}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-[#0088FF] text-2xl font-bold text-white transition group-hover:bg-[#006ACC]">
                      {getInitials(profile.full_name)}
                    </div>
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-semibold text-gray-900">{profile.full_name}</h1>
                  <p className="mt-0.5 text-sm text-gray-500">{freelancer.professional_title ?? t("common.freelancerFallback")}</p>
                  {formatCityForDisplay(profile.city) ? (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-gray-500">
                      <MapPinIcon className="h-4 w-4 shrink-0 text-red-500" />
                      {formatCityForDisplay(profile.city)}
                    </p>
                  ) : null}
                </div>
              </div>

              {!viewerIsOwner ? (
                <div className="mt-3 min-w-0 overflow-x-auto">
                  <div className="flex w-max min-w-full flex-nowrap items-center justify-start gap-2">
                  {followButtonMode !== "hidden" ? (
                    <button
                      type="button"
                      onClick={() => void handleFollowToggle()}
                      disabled={followBusy || followButtonMode === "loading"}
                      className={
                        followButtonMode === "unfollow"
                          ? `${outlineBtnClass} h-11 min-h-11 shrink-0 px-3 text-xs sm:px-4 sm:text-sm`
                          : `${primaryBtnClass} h-11 min-h-11 shrink-0 px-3 text-xs sm:px-4 sm:text-sm`
                      }
                    >
                      {followBusy
                        ? t("common.inProgress")
                        : followButtonMode === "loading"
                          ? t("common.loading")
                          : followButtonMode === "unfollow"
                            ? t("common.following")
                            : t("common.follow")}
                    </button>
                  ) : null}
                  {viewerUserId ? (
                    <StartConversationButton
                      otherUserId={freelancer.user_id}
                      className="h-11 shrink-0 px-3 text-xs sm:px-4 sm:text-sm"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void openContactModal()}
                    disabled={contactLoading}
                    className={`${primaryBtnClass} h-11 min-h-11 shrink-0 px-3 text-xs sm:px-4 sm:text-sm`}
                  >
                    {contactLoading ? t("common.loading") : t("common.contact")}
                  </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center justify-start gap-x-4 gap-y-2 text-sm text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarOutlineIcon className="h-4 w-4 shrink-0 text-gray-400" />
                  {formatDate(profile.member_since)}
                </span>
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-gray-900">{freelancer.average_rating.toFixed(1)}</span>
                  <span>
                    • {t("common.reviewsCount", { count: freelancer.total_reviews_count })}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BriefcaseOutlineIcon className="h-4 w-4 shrink-0 text-gray-400" />
                  {t("common.completedWorkCount", { count: completedWorkCount })}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() => {
                    setFollowListsModalTab("followers")
                    setFollowListsModalOpen(true)
                  }}
                  className="w-full rounded-[10px] bg-[#F9FAFB] px-4 py-3 text-left transition hover:bg-gray-100"
                >
                  <p className="mb-1 text-xs text-gray-500">{t("freelancerProfile.subscriberStat")}</p>
                  <p className="text-lg font-semibold tabular-nums text-gray-900">{followerCount}</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFollowListsModalTab("following")
                    setFollowListsModalOpen(true)
                  }}
                  className="w-full rounded-[10px] bg-[#F9FAFB] px-4 py-3 text-left transition hover:bg-gray-100"
                >
                  <p className="mb-1 text-xs text-gray-500">{t("freelancerProfile.subscribedStat")}</p>
                  <p className="text-lg font-semibold tabular-nums text-gray-900">{followingCount}</p>
                </button>
                <div className="rounded-[10px] bg-[#F9FAFB] px-4 py-3 text-left">
                  <p className="mb-1 text-xs text-gray-500">{t("freelancerProfile.ratingStat")}</p>
                  <p className="text-lg font-semibold tabular-nums text-gray-900">{freelancer.total_reviews_count}</p>
                </div>
                <div className="rounded-[10px] bg-[#F9FAFB] px-4 py-3 text-left">
                  <p className="mb-1 text-xs text-gray-500">{t("freelancerProfile.completedStat")}</p>
                  <p className="text-lg font-semibold tabular-nums text-gray-900">{completedWorkCount}</p>
                </div>
              </div>

              <ShareButtons
                url={shareUrl}
                text={t("share.freelancerText", { name: profileName })}
                className="mt-4"
              />

              {ownerVisitCount !== null ? (
                <p className="mt-3 text-left text-xs text-gray-500">
                  {t("freelancerProfile.publicViewsCount")}{" "}
                  <span className="font-semibold tabular-nums text-gray-900" title={t("common.publicViewsOwnerOnly")}>
                    {ownerVisitCount}
                  </span>{" "}
                  <Link to="/dashboard/stats" className="font-semibold text-[#0088FF] hover:underline">
                    {t("stats.seeStats")}
                  </Link>
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-start gap-2 border-t border-gray-100 pt-4">
                <span className="shrink-0 text-sm text-gray-500">{t("freelancerProfile.languages")}:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {freelancer.languages.map((language) => (
                    <span key={language} className={tagChipClass}>
                      {language}
                    </span>
                  ))}
                </div>
              </div>

              {hasSocialProfileLinks(freelancer) ? (
                <div className="mt-4 flex flex-wrap items-center justify-start gap-2 border-t border-gray-100 pt-4">
                  <span className="shrink-0 text-sm text-gray-500">{t("freelancerProfile.socialNetworks")}:</span>
                  <SocialProfileLinks urls={freelancer} className="flex min-w-0 flex-wrap items-center gap-2" />
                </div>
              ) : null}

              <div className="mt-4 min-w-0 overflow-x-auto border-t border-gray-100 pt-4">
                <div className="flex w-max min-w-full flex-nowrap items-center justify-start gap-2">
                <span className="shrink-0 text-sm text-gray-500">{t("freelancerProfile.resume")}:</span>
                {viewerIsOwner ? (
                  <>
                    <input
                      ref={ownerCvInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void handleOwnerCvUpload(file)
                        e.currentTarget.value = ""
                      }}
                    />
                    <button
                      type="button"
                      disabled={cvUploading}
                      onClick={() => ownerCvInputRef.current?.click()}
                      className={`${outlineBtnClass} shrink-0`}
                    >
                      {cvUploading ? t("common.loading") : t("common.addCv")}
                    </button>
                    <Link to="/cv-generator" className={`${outlineBtnClass} shrink-0`}>
                      {t("common.cvGeneration")}
                    </Link>
                  </>
                ) : null}
                {cvSignedUrl ? (
                  <a
                    href={cvSignedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${primaryBtnClass} shrink-0`}
                  >
                    {t("common.openCv")}
                  </a>
                ) : publicCvSlug ? (
                  <Link to={`/cv/${encodeURIComponent(publicCvSlug)}`} className={`${primaryBtnClass} shrink-0`}>
                    {t("common.openCv")}
                  </Link>
                ) : null}
                {cvSignedUrl || publicCvSlug ? (
                  <button type="button" onClick={() => void copyCvLink()} className={`${outlineBtnClass} shrink-0`}>
                    {t("common.copyLink")}
                  </button>
                ) : null}
                </div>
              </div>
            </section>

            {canRespondToApplications ? (
              <ProfilePendingOffers
                variant="application"
                offers={pendingJobApplications}
                busyId={applicationOfferBusyId}
                onAccept={(offer) => void handleAcceptJobApplication(offer)}
                onReject={(offer) => void handleRejectJobApplication(offer)}
              />
            ) : null}

            <div className="min-w-0 overflow-x-auto">
              <div className="mt-5 flex w-max min-w-full flex-nowrap items-center gap-2">
              <button
                type="button"
                onClick={() => setProfileTab("services")}
                className={`shrink-0 cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors duration-150 ${
                  profileTab === "services"
                    ? "border border-[#0088FF] bg-[#0088FF] text-white"
                    : "border border-[#E5E7EB] bg-white text-[#6B7280]"
                }`}
              >
                {t("common.services")}
              </button>
              <button
                type="button"
                onClick={() => setProfileTab("bio")}
                className={`shrink-0 cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors duration-150 ${
                  profileTab === "bio"
                    ? "border border-[#0088FF] bg-[#0088FF] text-white"
                    : "border border-[#E5E7EB] bg-white text-[#6B7280]"
                }`}
              >
                {t("common.aboutMe")}
              </button>
              <button
                type="button"
                onClick={() => setProfileTab("reviews")}
                className={`shrink-0 cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors duration-150 ${
                  profileTab === "reviews"
                    ? "border border-[#0088FF] bg-[#0088FF] text-white"
                    : "border border-[#E5E7EB] bg-white text-[#6B7280]"
                }`}
              >
                {t("common.reviews")}
              </button>
              </div>
            </div>

            {profileTab === "services" ? (
              <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[14px]">
                {services.length === 0 ? (
                  <p className="col-span-full text-sm text-gray-500">{t("freelancerProfile.noActiveServices")}</p>
                ) : (
                  services.map((service) => {
                    const negotiable = service.negotiable
                    const displayTitle = pickListingTitle(
                      { title: service.title, titleEn: service.titleEn },
                      locale,
                      t("listingDetail.defaultTitle"),
                    )
                    const displayDescription = pickListingDescription(
                      { description: service.description, descriptionEn: service.descriptionEn },
                      locale,
                    )
                    return (
                      <article
                        key={service.id}
                        className="flex min-h-[280px] flex-col rounded-[14px] border border-[#E5E7EB] border-l-[3px] border-l-transparent bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-[border-left-color,box-shadow] duration-200 ease-out hover:border-l-[#0088FF] hover:shadow-[-4px_0_12px_rgba(0,136,255,0.2)]"
                      >
                        <p className="mb-1 text-xs text-gray-400">{t("freelancerProfile.freelancerService")}</p>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <span className="text-gray-900">{freelancer.average_rating.toFixed(1)}</span>
                        </div>
                        <h2 className="mt-2 mb-2 line-clamp-2 text-base font-semibold text-gray-900">{displayTitle}</h2>
                        <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-gray-500">
                          {displayDescription.trim() ? displayDescription : t("common.noDescription")}
                        </p>
                        {service.tags.length > 0 ? (
                          <div className="mb-3 flex flex-wrap gap-1.5">
                            {service.tags.slice(0, 5).map((tag) => (
                              <span key={`${service.id}-${tag}`} className={tagChipClass}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mb-4 flex flex-wrap gap-1.5">
                          <span className={metaPillClass}>
                            {formatListingPrice(service.price, service.price_type, { negotiable })}
                          </span>
                          <span className={metaPillClass}>
                            <ViewCountEyeIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                            {service.views_count}
                          </span>
                        </div>
                        <div className="mt-auto flex gap-2 pt-1">
                          <Link
                            to={`/listing/${encodeURIComponent(service.id)}`}
                            className={`${primaryBtnClass} min-h-9 flex-1 text-center`}
                          >
                            {t("common.viewDetails")}
                          </Link>
                          <Link
                            to={`/freelancer/${encodeURIComponent(freelancer.slug)}`}
                            className={`${outlineBtnClass} min-h-9 flex-1 text-center`}
                            onClick={() => window.scrollTo(0, 0)}
                          >
                            {t("nav.profile")}
                          </Link>
                        </div>
                      </article>
                    )
                  })
                )}
              </div>
            ) : null}

            {profileTab === "bio" ? (
              <div className="mt-5 space-y-5">
                <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <h2 className="text-lg font-semibold text-gray-900">{t("common.bio")}</h2>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[#374151]">
                    {freelancer.bio ?? t("common.noBioAdded")}
                  </p>
                </section>

                <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <h2 className="text-lg font-semibold text-gray-900">{t("freelancerProfile.experience")}</h2>
                  <div className="mt-4 space-y-3">
                    {experience.length === 0 ? (
                      <p className="text-sm text-gray-500">{t("common.noExperienceAdded")}</p>
                    ) : (
                      experience.map((item) => (
                        <div key={item.id} className="rounded-[10px] border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                          <p className="font-semibold text-gray-900">{item.title}</p>
                          <p className="text-sm text-gray-600">{item.organization}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {formatDate(item.start_date)} - {item.end_date ? formatDate(item.end_date) : t("common.experienceUntilPresent")}
                          </p>
                          {item.description ? <p className="mt-2 text-sm text-[#374151]">{item.description}</p> : null}
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <h2 className="text-lg font-semibold text-gray-900">{t("freelancerProfile.education")}</h2>
                  <div className="mt-4 space-y-3">
                    {education.length === 0 ? (
                      <p className="text-sm text-gray-500">{t("common.noEducationAdded")}</p>
                    ) : (
                      education.map((item) => (
                        <div key={item.id} className="rounded-[10px] border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                          <p className="font-semibold text-gray-900">
                            {formatFreelancerEducationDegreeLevel(item.degree_level)}
                            {item.field_of_study?.trim() ? ` - ${item.field_of_study.trim()}` : ""}
                          </p>
                          <p className="text-sm text-gray-600">{item.institution}</p>
                          {item.end_date ? (
                            <p className="mt-1 text-xs text-gray-500">{t("common.graduationDate", { date: formatDate(item.end_date) })}</p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <h2 className="text-lg font-semibold text-gray-900">{t("common.skills")}</h2>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {skills.map((skill) => (
                      <span key={skill.id} className={tagChipClass}>
                        {skill.name}
                      </span>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            {profileTab === "reviews" ? (
              <section className="mt-5 rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <div className="space-y-3">
                  {reviews.length === 0 ? (
                    <p className="text-sm text-gray-500">{t("freelancerProfile.noReviews")}</p>
                  ) : (
                    reviews.map((review) => (
                      <div key={review.id} className="rounded-[10px] border border-[#E5E7EB] p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0088FF] text-xs font-bold text-white">
                            {getInitials(review.reviewer_name)}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{review.reviewer_name}</p>
                            <p className="text-xs text-gray-500">{formatDate(review.created_at)}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-gray-900">{review.rating_overall.toFixed(1)}</p>
                        <p className="mt-2 text-sm text-[#374151]">{review.review_text}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : null}

            {portfolioItems.length > 0 ? (
              <section className="mt-5 rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <h2 className="text-lg font-semibold text-gray-900">{t("freelancerProfile.portfolio")}</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {portfolioItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedImageUrl(item.image_url)}
                      className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:border-[#0088FF]/40"
                    >
                      <OptimizedImage
                        src={jobOrServiceImageDisplayUrl(supabase, item.image_url, "thumbnail") ?? item.image_url}
                        alt={t("common.portfolioImageAlt", { title: item.title })}
                        width={400}
                        height={144}
                        className="h-36 w-full object-cover"
                      />
                      <div className="p-3">
                        <p className="truncate text-sm font-semibold text-gray-900">{item.title}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
        {slug && !loading ? <SimilarFreelancers slug={slug} /> : null}
      </main>

      {contactModalOpen && profile ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setContactModalOpen(false)
          }}
        >
          <div
            className="relative max-h-[min(85vh,calc(100vh-32px))] w-full max-w-md overflow-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 id="contact-modal-title" className="text-lg font-bold text-gray-900">
                {t("common.contact")}
              </h2>
              <button
                type="button"
                onClick={() => setContactModalOpen(false)}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">{profile.full_name}</p>

            <div className="mt-5 space-y-4">
              {profile.phone && profile.phone.trim() ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("common.phone")}</p>
                  <p className="mt-1 break-all font-medium text-gray-900">{profile.phone}</p>
                  <button
                    type="button"
                    onClick={() => void copyClip(profile.phone!, "ნომერი")}
                    className="mt-2 text-sm font-semibold text-[#0088FF] hover:underline"
                  >
                    {t("common.copy")}
                  </button>
                </div>
              ) : null}

              {profile.email && profile.email.trim() ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("common.email")}</p>
                  <p className="mt-1 break-all font-medium text-gray-900">{profile.email}</p>
                  <button
                    type="button"
                    onClick={() => void copyClip(profile.email!, "ელფოსტა")}
                    className="mt-2 text-sm font-semibold text-[#0088FF] hover:underline"
                  >
                    {t("common.copy")}
                  </button>
                </div>
              ) : null}

              {!profile.phone?.trim() && !profile.email?.trim() ? (
                <p className="text-sm text-slate-600">{t("common.contactNotSet")}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {selectedImageUrl ? (
        <button
          type="button"
          onClick={() => setSelectedImageUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
        >
          <OptimizedImage
            src={jobOrServiceImageDisplayUrl(supabase, selectedImageUrl, "detail") ?? selectedImageUrl}
            alt={t("common.portfolioFullSize")}
            width={900}
            height={900}
            className="max-h-full max-w-full rounded-lg"
          />
        </button>
      ) : null}

      {profile ? (
        <FollowListsModal
          open={followListsModalOpen}
          onClose={() => setFollowListsModalOpen(false)}
          profileId={profile.id}
          initialTab={followListsModalTab}
        />
      ) : null}
      {avatarLightboxOpen && profile ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("common.fullscreenAvatar")}
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setAvatarLightboxOpen(false)}
        >
          <button
            type="button"
            className="relative max-h-[min(85vh,900px)] max-w-[min(85vw,900px)] rounded-full border-4 border-white shadow-2xl ring-4 ring-black/20"
            onClick={(e) => e.stopPropagation()}
          >
            {profile.avatar_url ? (
              <OptimizedImage
                src={profileAvatarDisplayUrl ?? profile.avatar_url}
                alt={t("common.fullscreenAvatarAlt", { name: profile.full_name })}
                width={900}
                height={900}
                className="max-h-[min(85vh,900px)] max-w-[min(85vw,900px)] rounded-full object-contain"
              />
            ) : (
              <div className="flex aspect-square max-h-[min(85vh,900px)] max-w-[min(85vw,900px)] min-h-[200px] min-w-[200px] items-center justify-center rounded-full bg-[#0088FF] p-16 text-7xl font-bold text-white sm:text-8xl">
                {getInitials(profile.full_name)}
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAvatarLightboxOpen(false)}
            className="absolute right-4 top-4 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-gray-900 shadow hover:bg-white"
          >
            {t("common.close")}
          </button>
        </div>
      ) : null}
    </div>
  </>
  )
}
