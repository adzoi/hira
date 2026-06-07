import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useToast } from "../components/ui/ToastProvider.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import { countHirerProfileVisits } from "../lib/profileVisits.ts"
import FollowListsModal, { FollowStatPills, type FollowModalTab } from "../components/FollowListsModal.tsx"
import { countFollowers, countFollowing, followUser, isFollowing, unfollowUser } from "../lib/follows.ts"
import { jobVacancyStats } from "../lib/jobVacancies.ts"
import SaveBookmarkButton from "../components/SaveBookmarkButton.tsx"
import StartConversationButton from "../components/StartConversationButton.tsx"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { formatCityForDisplay, formatIndustryForDisplay } from "../lib/marketplaceFilters.ts"
import { safeExternalHref } from "../lib/validation.ts"
import { formatJobBudget } from "../lib/listingPrice.ts"
import ProfilePendingOffers from "../components/ProfilePendingOffers.tsx"
import {
  acceptListingOffer,
  declineListingOffer,
  fetchPendingListingOffersFromHirer,
  type ProfileListingOffer,
} from "../lib/profileOffers.ts"
import {
  fetchHirerPublic,
  UUID_RE,
} from "../lib/queries/fetchHirerPublic.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"

function companyInitials(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return "კო"
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
  }
  const only = parts[0] ?? "კ"
  return only.slice(0, 2).toUpperCase()
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("ka-GE")
}

function reviewerInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "ფ"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}


export default function HirerPublicPage() {
  const { t } = useTranslation()
  const { pushToast } = useToast()
  const navigate = useNavigate()
  const { id } = useParams()
  const {
    data,
    isLoading: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.hirerPublic(id ?? ""),
    queryFn: () => fetchHirerPublic(id!),
    enabled: Boolean(id),
  })
  const error = isError ? queryErrorMessage(queryError, "დეტალების ჩატვირთვა ვერ მოხერხდა.") : ""
  const hirer = data?.hirer ?? null
  const openJobs = data?.openJobs ?? []
  const hirerReviews = data?.hirerReviews ?? []
  const invalidId = data?.invalidId ?? false
  /** Shown only when logged-in viewer owns this hirer profile. */
  const [ownerVisitCount, setOwnerVisitCount] = useState<number | null>(null)
  const [viewerUserId, setViewerUserId] = useState<string | null>(null)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [followListsModalOpen, setFollowListsModalOpen] = useState(false)
  const [followListsModalTab, setFollowListsModalTab] = useState<FollowModalTab>("followers")
  const [followButtonMode, setFollowButtonMode] = useState<"hidden" | "loading" | "guest" | "follow" | "unfollow">(
    "hidden",
  )
  const [followBusy, setFollowBusy] = useState(false)
  const [viewerFreelancerProfileId, setViewerFreelancerProfileId] = useState<string | null>(null)
  const [pendingListingOffers, setPendingListingOffers] = useState<ProfileListingOffer[]>([])
  const [listingOfferBusyId, setListingOfferBusyId] = useState<string | null>(null)

  const hirerRatingSummary = useMemo(() => {
    if (hirerReviews.length === 0) return { average: 0, count: 0 }
    const sum = hirerReviews.reduce((acc, r) => acc + r.rating_overall, 0)
    return { average: sum / hirerReviews.length, count: hirerReviews.length }
  }, [hirerReviews])

  const viewerOwnsHirer = Boolean(hirer?.ownerUserId && viewerUserId && viewerUserId === hirer.ownerUserId)
  const canRespondToListingOffers = Boolean(
    hirer?.id && viewerFreelancerProfileId && viewerUserId && !viewerOwnsHirer,
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
        setViewerFreelancerProfileId(null)
        return
      }
      const { data: fp } = await client.from("freelancer_profiles").select("id").eq("user_id", uid).maybeSingle()
      if (!cancelled) setViewerFreelancerProfileId(fp?.id ?? null)
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
    if (!supabase || !canRespondToListingOffers || !hirer?.id || !viewerFreelancerProfileId) {
      setPendingListingOffers([])
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const offers = await fetchPendingListingOffersFromHirer(supabase, hirer.id, viewerFreelancerProfileId)
        if (!cancelled) setPendingListingOffers(offers)
      } catch {
        if (!cancelled) setPendingListingOffers([])
      }
    })()

    return () => {
      cancelled = true
    }
  }, [canRespondToListingOffers, hirer?.id, viewerFreelancerProfileId])

  useEffect(() => {
    document.title = data?.documentTitle ?? t("hirerPublic.title")
    return () => {
      document.title = t("brand.name")
    }
  }, [data?.documentTitle, t])

  useEffect(() => {
    if (!hirer?.ownerUserId || !isSupabaseConfigured || !supabase) {
      setOwnerVisitCount(null)
      return
    }

    const client = supabase
    let cancelled = false

    const loadVisitCountIfOwner = async () => {
      const {
        data: { session },
      } = await client.auth.getSession()
      if (!session?.user?.id || session.user.id !== hirer.ownerUserId) {
        if (!cancelled) setOwnerVisitCount(null)
        return
      }
      const n = await countHirerProfileVisits(hirer.id)
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
  }, [hirer?.id, hirer?.ownerUserId])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !hirer?.ownerUserId) {
      setFollowerCount(0)
      setFollowingCount(0)
      setFollowButtonMode("hidden")
      return
    }

    const profileSubjectId = hirer.ownerUserId
    let cancelled = false

    ;(async () => {
      if (viewerOwnsHirer) setFollowButtonMode("hidden")

      try {
        const [n, nf] = await Promise.all([countFollowers(profileSubjectId), countFollowing(profileSubjectId)])
        if (cancelled) return
        setFollowerCount(Number.isFinite(n) ? n : 0)
        setFollowingCount(Number.isFinite(nf) ? nf : 0)
      } catch {
        if (!cancelled) {
          setFollowerCount(0)
          setFollowingCount(0)
        }
      }

      if (viewerOwnsHirer || cancelled) return

      setFollowButtonMode("loading")
      try {
        const { data: sessionPayload } = await supabase.auth.getSession()
        if (!sessionPayload.session?.user?.id) {
          if (!cancelled) setFollowButtonMode("guest")
          return
        }
        const f = await isFollowing(profileSubjectId).catch(() => false)
        if (cancelled) return
        setFollowButtonMode(f ? "unfollow" : "follow")
      } catch {
        if (!cancelled) setFollowButtonMode("guest")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hirer?.ownerUserId, viewerOwnsHirer])

  const reloadPendingListingOffers = async () => {
    if (!supabase || !hirer?.id || !viewerFreelancerProfileId) {
      setPendingListingOffers([])
      return
    }
    try {
      const offers = await fetchPendingListingOffersFromHirer(supabase, hirer.id, viewerFreelancerProfileId)
      setPendingListingOffers(offers)
    } catch {
      setPendingListingOffers([])
    }
  }

  const handleAcceptListingOffer = async (offer: ProfileListingOffer) => {
    if (!supabase) return
    setListingOfferBusyId(offer.id)
    try {
      await acceptListingOffer(supabase, offer.id)
      pushToast({ type: "success", message: "შეთავაზება მიღებულია." })
      await reloadPendingListingOffers()
    } catch (e) {
      pushToast({
        type: "error",
        message: e instanceof Error ? e.message : "შეცდომა მოხდა.",
      })
    } finally {
      setListingOfferBusyId(null)
    }
  }

  const handleDeclineListingOffer = async (offer: ProfileListingOffer) => {
    if (!supabase) return
    if (!window.confirm("ნამდვილად გსურს შეთავაზების უარყოფა?")) return
    setListingOfferBusyId(offer.id)
    try {
      await declineListingOffer(supabase, offer.id)
      pushToast({ type: "info", message: "შეთავაზება უარყოფილია." })
      await reloadPendingListingOffers()
    } catch (e) {
      pushToast({
        type: "error",
        message: e instanceof Error ? e.message : "შეცდომა მოხდა.",
      })
    } finally {
      setListingOfferBusyId(null)
    }
  }

  const handleHirerFollowToggle = async () => {
    if (!supabase || !hirer?.ownerUserId || viewerOwnsHirer || followBusy) return
    const hirerProfileUuid = hirer.id

    const path = `/hirer/${encodeURIComponent(hirerProfileUuid)}`
    if (followButtonMode === "guest") {
      navigate(`/login?reason=follow&redirect=${encodeURIComponent(path)}`)
      return
    }

    if (followButtonMode !== "follow" && followButtonMode !== "unfollow") return

    setFollowBusy(true)
    try {
      if (followButtonMode === "follow") {
        await followUser(hirer.ownerUserId)
        setFollowButtonMode("unfollow")
        setFollowerCount((c) => Math.max(0, (Number.isFinite(c) ? c : 0) + 1))
        pushToast({ type: "success", message: "გამოწერა დასრულდა." })
      } else {
        await unfollowUser(hirer.ownerUserId)
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FC]">
        <main className="mx-auto w-full max-w-[720px] px-4 py-8 md:px-6">
          <SkeletonCard />
          <SkeletonCard />
        </main>
      </div>
    )
  }

  if (UUID_RE.test(id ?? "") && !hirer && !error) {
    return (
      <div className="min-h-screen bg-[#F8F9FC]">
        <main className="mx-auto w-full max-w-[720px] px-4 py-16 text-center md:px-6">
          <p className="text-xl font-bold text-[#1B2B4B]">{t("hirerPublic.notFound")}</p>
          <Link to="/hirers" className="mt-6 inline-flex h-11 items-center rounded-lg bg-[#1B2B4B] px-5 text-sm font-semibold text-white">
            {t("hirerPublic.allHirers")}
          </Link>
        </main>
      </div>
    )
  }

  if ((error || invalidId || !hirer) && !UUID_RE.test(id ?? "")) {
    return (
      <div className="min-h-screen bg-[#F8F9FC]">
        <main className="mx-auto w-full max-w-[720px] px-4 py-8 md:px-6">
          {error || invalidId ? <ErrorState message={error || "არასწორი იდენტიფიკატორი."} /> : <ErrorState message="არასწორი ბმული." />}
          <Link to="/hirers" className="mt-6 inline-block text-sm font-semibold text-[#1B2B4B] hover:text-[#D4A843]">
            {t("hirerPublic.backToHirers")}
          </Link>
        </main>
      </div>
    )
  }

  if (!hirer) {
    return (
      <div className="min-h-screen bg-[#F8F9FC]">
        <main className="mx-auto w-full max-w-[720px] px-4 py-8 md:px-6">
          <ErrorState message={error || "არ ხელმისაწვდომია."} />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] page-enter">
      <main className="mx-auto w-full max-w-[720px] px-4 py-6 md:px-6 md:py-10">
        <Link to="/hirers" className="mb-6 inline-block text-sm font-semibold text-[#1B2B4B] hover:text-[#D4A843]">
          {t("hirerPublic.backToHirers")}
        </Link>

        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-start gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#1B2B4B]/5 text-lg font-black text-[#1B2B4B]">
              {hirer.avatarUrl ? (
                <img
                  src={avatarImageUrl(supabase, hirer.avatarUrl) ?? hirer.avatarUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                companyInitials(hirer.companyName)
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-extrabold text-[#1B2B4B]">{hirer.companyName}</h1>
              {hirer.ownerUserId ? (
                <FollowStatPills
                  followerCount={followerCount}
                  followingCount={followingCount}
                  className="mt-2"
                  onOpenFollowers={() => {
                    setFollowListsModalTab("followers")
                    setFollowListsModalOpen(true)
                  }}
                  onOpenFollowing={() => {
                    setFollowListsModalTab("following")
                    setFollowListsModalOpen(true)
                  }}
                />
              ) : null}
              {[formatIndustryForDisplay(hirer.industry), formatCityForDisplay(hirer.city)].filter(Boolean).length > 0 ? (
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {[formatIndustryForDisplay(hirer.industry), formatCityForDisplay(hirer.city)].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-slate-700">{t("common.contactLabel", { name: hirer.contactName })}</p>
              <p className="mt-2 text-sm font-semibold text-[#D4A843]">
                {hirerRatingSummary.count === 0 ? (
                  <span className="text-slate-500">{t("freelancerProfile.noReviews")}</span>
                ) : (
                  <>
                    {hirerRatingSummary.average.toFixed(1)} ·{" "}
                    {t("common.reviewsCount", { count: hirerRatingSummary.count })}
                  </>
                )}
              </p>
              {safeExternalHref(hirer.websiteUrl) ? (
                <a
                  href={safeExternalHref(hirer.websiteUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm font-semibold text-[#D4A843] underline"
                >
                  {t("common.website")}
                </a>
              ) : null}
            </div>
            </div>
            {!viewerOwnsHirer ? (
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <SaveBookmarkButton variant="icon" resourceType="hirer" resourceId={hirer.id} />
                {hirer.ownerUserId && followButtonMode !== "hidden" ? (
                  <button
                    type="button"
                    onClick={() => void handleHirerFollowToggle()}
                    disabled={followBusy || followButtonMode === "loading"}
                    className={`h-11 w-full rounded-lg border px-5 text-sm font-semibold transition sm:min-w-[8.5rem] disabled:pointer-events-none disabled:opacity-60 ${
                      followButtonMode === "unfollow"
                        ? "border-slate-300 bg-white text-[#1B2B4B] hover:border-[#D4A843]"
                        : "border-[#1B2B4B] bg-[#1B2B4B] text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]"
                    }`}
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
                {viewerUserId && !viewerOwnsHirer && hirer.ownerUserId ? (
                  <StartConversationButton
                    otherUserId={hirer.ownerUserId}
                    variant="primary"
                    className="h-11 w-full sm:min-w-[10rem]"
                  />
                ) : null}
              </div>
            ) : null}
          </div>
          <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-6 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-slate-500">{t("hirerPublic.activeListings")}</dt>
              <dd className="mt-1 text-lg font-black text-[#1B2B4B]">{openJobs.length}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs uppercase text-slate-500">{t("common.statistics")}</dt>
              <dd className="mt-1 break-words text-lg font-black text-[#1B2B4B] [overflow-wrap:anywhere]">
                {t("hirers.statsJobsCompleted", { posted: hirer.jobsPosted, completed: hirer.completedJobs })}
              </dd>
            </div>
            {ownerVisitCount !== null ? (
              <div>
                <dt className="text-xs uppercase text-slate-500">{t("hirerPublic.publicViewsVisitors")}</dt>
                <dd
                  className="mt-1 text-lg font-black tabular-nums text-[#1B2B4B]"
                  title={t("common.publicViewsOwnerOnly")}
                >
                  {ownerVisitCount}
                </dd>
              </div>
            ) : null}
          </dl>
          {hirer.description ? (
            <div className="mt-6 border-t border-slate-100 pt-6">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">{t("common.description")}</h2>
              <p className="mt-3 break-words whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 [overflow-wrap:anywhere]">
                {hirer.description}
              </p>
            </div>
          ) : null}
        </header>

        {canRespondToListingOffers ? (
          <ProfilePendingOffers
            variant="listing"
            offers={pendingListingOffers}
            busyId={listingOfferBusyId}
            onAccept={(offer) => void handleAcceptListingOffer(offer)}
            onDecline={(offer) => void handleDeclineListingOffer(offer)}
          />
        ) : null}

        {hirerReviews.length > 0 ? (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="border-l-4 border-[#D4A843] pl-3 text-lg font-extrabold text-[#1B2B4B]">{t("common.reviews")}</h2>
            <ul className="mt-4 space-y-3">
              {hirerReviews.map((review) => (
                <li key={review.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1B2B4B] text-xs font-bold text-white">
                      {reviewerInitials(review.reviewer_name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-[#1B2B4B]">{review.reviewer_name}</p>
                      <p className="text-xs text-slate-500">{formatDate(review.created_at)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[#D4A843]">
                    {review.rating_overall.toFixed(1)}
                  </p>
                  <p className="mt-2 break-words text-sm text-slate-700 [overflow-wrap:anywhere]">{review.review_text}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-[#1B2B4B]">{t("hirerPublic.activeListingsHeading")}</h2>
            <Link to="/jobs" className="text-sm font-semibold text-[#1B2B4B] hover:text-[#D4A843]">
              {t("hirerPublic.seeMoreJobs")}
            </Link>
          </div>
          {openJobs.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
              {t("hirerPublic.noVacanciesNow")}
            </p>
          ) : (
            <ul className="space-y-3">
              {openJobs.map((job) => {
                const vac = jobVacancyStats(job.vacancies, job.acceptedCount)
                return (
                  <li key={job.id}>
                    <Link
                      to={`/job/${job.id}`}
                      className="block min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#D4A843]/70"
                    >
                      <p className="break-words font-bold text-[#1B2B4B] [overflow-wrap:anywhere]">{job.title}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {formatJobBudget(job.budgetMin, job.budgetMax, job.budgetType)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {vac.isFull ? (
                          <span className="font-semibold text-amber-800">{t("status.filled")}</span>
                        ) : (
                          <>
                            {t("common.spotsRemaining", {
                              remaining: vac.remaining,
                              accepted: vac.acceptedCount,
                              vacancies: vac.vacancies,
                            })}
                          </>
                        )}
                      </p>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {hirer.ownerUserId ? (
          <FollowListsModal
            open={followListsModalOpen}
            onClose={() => setFollowListsModalOpen(false)}
            profileId={hirer.ownerUserId}
            initialTab={followListsModalTab}
          />
        ) : null}
      </main>
    </div>
  )
}
