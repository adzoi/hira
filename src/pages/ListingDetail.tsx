import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import FreelancerAvailabilityIndicator from "../components/FreelancerAvailabilityIndicator.tsx"
import { ViewCountEyeIcon } from "../components/ViewCountEyeIcon.tsx"
import SaveBookmarkButton from "../components/SaveBookmarkButton.tsx"
import StartConversationButton from "../components/StartConversationButton.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import { stripLegacyPricePrefix } from "../lib/listingDescription.ts"
import { formatListingPrice } from "../lib/listingPrice.ts"
import { fetchListingDetail, type ListingDetail } from "../lib/queries/fetchListingDetail.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { avatarImageUrl, serviceImageDetailUrl, serviceImageThumbnailUrl } from "../lib/storageImageUrl.ts"
import { validateInquiryMessage, validateMoneyAmount } from "../lib/validation.ts"

type ListingMeta = {
  categoryId: string | null
  subcategoryId: string | null
  tags: string[]
}

const META_PREFIX = "<!--gigori-meta:"
const META_SUFFIX = "-->"

function parseListingDescription(raw: string | null): { description: string; meta: ListingMeta } {
  const fallback: ListingMeta = { categoryId: null, subcategoryId: null, tags: [] }
  if (!raw) return { description: "", meta: fallback }
  if (!raw.startsWith(META_PREFIX)) return { description: stripLegacyPricePrefix(raw), meta: fallback }
  const endIndex = raw.indexOf(META_SUFFIX)
  if (endIndex < 0) return { description: raw, meta: fallback }
  const metaChunk = raw.slice(META_PREFIX.length, endIndex).trim()
  const body = stripLegacyPricePrefix(raw.slice(endIndex + META_SUFFIX.length))
  try {
    const parsed = JSON.parse(metaChunk) as Partial<ListingMeta>
    return {
      description: body,
      meta: {
        categoryId: parsed.categoryId ?? null,
        subcategoryId: parsed.subcategoryId ?? null,
        tags: Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20) : [],
      },
    }
  } catch {
    return { description: stripLegacyPricePrefix(raw), meta: fallback }
  }
}

function getInitials(fullName: string) {
  const parts = fullName.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "ფ"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("ka-GE")
}

function CalendarOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function SendOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const cardClass = "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"

export default function ListingDetailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { id } = useParams()
  const {
    data: item = null,
    isLoading: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.listingDetail(id ?? ""),
    queryFn: () => fetchListingDetail(id!),
    enabled: Boolean(id) && isSupabaseConfigured,
  })
  const error = !id
    ? "ლისტინგი ვერ მოიძებნა."
    : !isSupabaseConfigured
      ? "მონაცემთა ბაზა არ არის კონფიგურირებული."
      : isError
        ? queryErrorMessage(queryError, "ჩატვირთვა ვერ მოხერხდა.")
        : ""
  const [selectedImage, setSelectedImage] = useState(0)
  const [viewerType, setViewerType] = useState<"hirer" | "freelancer" | null>(null)
  const [viewerFreelancerProfileId, setViewerFreelancerProfileId] = useState<string | null>(null)
  const [viewerHirerProfileId, setViewerHirerProfileId] = useState<string | null>(null)
  const [existingInquiryId, setExistingInquiryId] = useState<string | null>(null)
  const [offerMessage, setOfferMessage] = useState("")
  const [offerBudget, setOfferBudget] = useState("")
  const [offerError, setOfferError] = useState("")
  const [offerSubmitting, setOfferSubmitting] = useState(false)
  const [subcategoryLabel, setSubcategoryLabel] = useState<string | null>(null)
  const trackedListingViewRef = useRef<string | null>(null)

  useEffect(() => {
    const loadViewer = async () => {
      if (!isSupabaseConfigured || !supabase) return
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setViewerType(null)
        setViewerFreelancerProfileId(null)
        setViewerHirerProfileId(null)
        setExistingInquiryId(null)
        return
      }
      const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", user.id).maybeSingle()
      const ut = profile?.user_type === "hirer" ? "hirer" : profile?.user_type === "freelancer" ? "freelancer" : null
      setViewerType(ut)
      if (ut === "freelancer") {
        const { data: fp } = await supabase.from("freelancer_profiles").select("id").eq("user_id", user.id).maybeSingle()
        setViewerFreelancerProfileId(fp?.id ?? null)
        setViewerHirerProfileId(null)
      } else if (ut === "hirer") {
        setViewerFreelancerProfileId(null)
        const { data: hp } = await supabase.from("hirer_profiles").select("id").eq("user_id", user.id).maybeSingle()
        setViewerHirerProfileId(hp?.id ?? null)
      } else {
        setViewerFreelancerProfileId(null)
        setViewerHirerProfileId(null)
      }
    }
    void loadViewer()
  }, [])

  useEffect(() => {
    const loadInquiry = async () => {
      if (!item?.id || !viewerHirerProfileId || !supabase) {
        setExistingInquiryId(null)
        return
      }
      const { data } = await supabase
        .from("service_inquiries")
        .select("id")
        .eq("service_id", item.id)
        .eq("hirer_profile_id", viewerHirerProfileId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      setExistingInquiryId(data?.id ?? null)
    }
    void loadInquiry()
  }, [item?.id, viewerHirerProfileId])

  const imagePublicUrls = useMemo(() => {
    if (!item) return []
    const client = supabase
    if (!client) return []
    return item.imageUrls.map((path) => ({
      thumb: serviceImageThumbnailUrl(client, path),
      detail: serviceImageDetailUrl(client, path),
    }))
  }, [item, supabase])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !id || !item?.id || item.id !== id) return
    if (trackedListingViewRef.current === item.id) return
    trackedListingViewRef.current = item.id
    const serviceId = item.id
    void (async () => {
      try {
        const { data: viewCount, error: viewError } = await supabase.rpc("increment_service_views", { p_service_id: serviceId })
        if (viewError) {
          if (import.meta.env.DEV) console.warn("[ListingDetail] increment_service_views:", viewError.message)
          return
        }
        const next = Number(viewCount ?? 0)
        if (!Number.isFinite(next)) return
        queryClient.setQueryData<ListingDetail>(queryKeys.listingDetail(serviceId), (prev) =>
          prev && prev.id === serviceId ? { ...prev, viewsCount: next } : prev,
        )
      } catch {
        /* non-blocking */
      }
    })()
  }, [id, item?.id, queryClient])

  const parsed = useMemo(() => parseListingDescription(item?.descriptionRaw ?? ""), [item?.descriptionRaw])

  useEffect(() => {
    const sid = parsed.meta.subcategoryId?.trim()
    if (!sid || !isSupabaseConfigured || !supabase) {
      setSubcategoryLabel(null)
      return
    }
    let cancelled = false
    void (async () => {
      const { data } = await supabase.from("subcategories").select("name_ka").eq("id", sid).maybeSingle()
      if (!cancelled) setSubcategoryLabel(data?.name_ka?.trim() ? String(data.name_ka) : null)
    })()
    return () => {
      cancelled = true
    }
  }, [parsed.meta.subcategoryId, supabase])

  useEffect(() => {
    if (!item) return
    document.title = `${item.title} — გიგორი`
    return () => {
      document.title = "გიგორი"
    }
  }, [item])

  const canMakeOffer =
    Boolean(item) &&
    viewerType === "hirer" &&
    item!.freelancerProfileId &&
    viewerFreelancerProfileId !== item!.freelancerProfileId

  const viewerOwnsListing =
    Boolean(item) &&
    viewerFreelancerProfileId != null &&
    viewerFreelancerProfileId === item!.freelancerProfileId

  const submitOffer = async () => {
    if (!item || !supabase) return
    setOfferError("")
    const messageResult = validateInquiryMessage(offerMessage)
    if (!messageResult.ok) {
      setOfferError(messageResult.message)
      return
    }
    const message = messageResult.value
    let proposedBudget: number | null = null
    const budgetRaw = offerBudget.trim()
    if (budgetRaw) {
      const budgetResult = validateMoneyAmount(budgetRaw, { min: 0, label: "შემოთავაზებული თანხა" })
      if (!budgetResult.ok || budgetResult.value == null) {
        setOfferError(budgetResult.ok ? "შემოთავაზებული თანხა არასწორია." : budgetResult.message)
        return
      }
      proposedBudget = budgetResult.value
    }

    setOfferSubmitting(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        navigate(`/login?redirect=${encodeURIComponent(`/listing/${item.id}`)}`)
        return
      }
      const { data: hirerProfile, error: hirerErr } = await supabase
        .from("hirer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle()
      if (hirerErr) throw hirerErr
      if (!hirerProfile) {
        setOfferError("დამქირავებლის პროფილი საჭიროა შეთავაზებისთვის.")
        return
      }
      const { error: insertErr } = await supabase.from("service_inquiries").insert({
        service_id: item.id,
        freelancer_profile_id: item.freelancerProfileId,
        hirer_profile_id: hirerProfile.id,
        message,
        proposed_budget: proposedBudget,
        status: "pending",
      })
      if (insertErr) throw insertErr
      const { data: latestInquiry } = await supabase
        .from("service_inquiries")
        .select("id")
        .eq("service_id", item.id)
        .eq("hirer_profile_id", hirerProfile.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (latestInquiry?.id) setExistingInquiryId(latestInquiry.id)
      setOfferMessage("")
      setOfferBudget("")
      setOfferError("")
    } catch (e) {
      setOfferError(e instanceof Error ? e.message : "შეთავაზების გაგზავნა ვერ მოხერხდა.")
    } finally {
      setOfferSubmitting(false)
    }
  }

  return (
    <div className="bg-slate-50 page-enter">
      <main className="mx-auto flex w-full max-w-[1100px] flex-col px-4 py-4 md:px-6 md:py-5 lg:h-[calc(100dvh-11rem)] lg:max-h-[calc(100dvh-11rem)]">
        <Link
          to="/listings"
          className="mb-3 inline-flex shrink-0 items-center gap-1 text-sm font-medium text-slate-600 transition hover:text-[#0088FF]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          განცხადებები
        </Link>

        {loading ? (
          <div className="grid min-h-[420px] flex-1 grid-cols-2 gap-4">
            <SkeletonCard lines={8} />
            <SkeletonCard lines={8} avatar />
          </div>
        ) : error || !item ? (
          <div className={`${cardClass} items-center justify-center p-8 text-center`}>
            <p className="text-lg font-semibold text-[#1B2B4B]">{error || "ლისტინგი ვერ მოიძებნა."}</p>
            <Link
              to="/listings"
              className="mt-4 inline-flex h-10 items-center rounded-lg bg-[#0088FF] px-4 text-sm font-semibold text-white hover:bg-[#006ACC]"
            >
              დაბრუნდი ლისტინგებზე
            </Link>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
            <article className={`${cardClass} p-4 md:p-5`}>
              <div className="flex shrink-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-xl font-bold leading-snug text-[#1B2B4B] md:text-2xl">{item.title}</h1>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <ViewCountEyeIcon className="h-3.5 w-3.5" />
                      {item.viewsCount} ნახვა
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarOutlineIcon className="h-3.5 w-3.5" />
                      {formatDate(item.createdAt)}
                    </span>
                  </div>
                </div>
                {!viewerOwnsListing ? (
                  <SaveBookmarkButton variant="icon" resourceType="service" resourceId={item.id} />
                ) : null}
              </div>

              {imagePublicUrls.length > 0 ? (
                <div className="mt-3 shrink-0">
                  <div className="overflow-hidden rounded-xl bg-slate-100">
                    <img
                      src={imagePublicUrls[Math.min(selectedImage, imagePublicUrls.length - 1)].detail}
                      alt=""
                      className="h-36 w-full object-cover md:h-44"
                    />
                  </div>
                  {imagePublicUrls.length > 1 ? (
                    <div className="mt-2 flex gap-1.5 overflow-x-auto">
                      {imagePublicUrls.map((urls, index) => (
                        <button
                          key={urls.thumb}
                          type="button"
                          onClick={() => setSelectedImage(index)}
                          className={`h-12 w-14 shrink-0 overflow-hidden rounded-md border-2 ${
                            selectedImage === index ? "border-[#0088FF]" : "border-slate-200"
                          }`}
                        >
                          <img src={urls.thumb} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {parsed.description || "დეტალური აღწერა ჯერ არ არის დამატებული."}
                </p>
              </div>
            </article>

            <aside className={`${cardClass} p-4 md:p-5`}>
              <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 pb-4">
                <FreelancerAvailabilityIndicator
                  available={item.isAcceptingNewWork}
                  labelWhenAvailable="ხელმისაწვდომია ახალი სამუშაოებისთვის"
                  labelWhenUnavailable="ამჟამად ახალი სამუშაოებისთვის ხელმიუწვდომელია"
                >
                  <Link
                    to={`/freelancer/${encodeURIComponent(item.freelancerSlug)}`}
                    className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-bold text-[#1B2B4B]"
                  >
                    {item.avatarUrl ? (
                      <img
                        src={avatarImageUrl(supabase, item.avatarUrl) ?? item.avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getInitials(item.fullName)
                    )}
                  </Link>
                </FreelancerAvailabilityIndicator>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/freelancer/${encodeURIComponent(item.freelancerSlug)}`}
                    className="block truncate font-bold text-[#1B2B4B] hover:text-[#0088FF]"
                  >
                    {item.fullName}
                  </Link>
                  <p className="truncate text-sm text-slate-600">{item.professionalTitle}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold text-[#D4A843]">
                    <StarIcon className="h-3.5 w-3.5" />
                    {item.averageRating.toFixed(1)}
                  </p>
                </div>
              </div>

              <div className="mt-4 shrink-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ფასი</p>
                <p className="text-2xl font-bold text-[#1B2B4B]">{formatListingPrice(item.price, item.priceType)}</p>
              </div>

              {!item.isAcceptingNewWork ? (
                <p className="mt-3 shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-900">
                  ფრილანსერი ამჟამად დაკავებულია — შეთავაზება მაინც შეგიძლიათ.
                </p>
              ) : null}

              {subcategoryLabel ? (
                <p className="mt-3 shrink-0 text-xs text-slate-600">
                  <span className="font-semibold text-[#1B2B4B]">ქვეკატეგორია:</span> {subcategoryLabel}
                </p>
              ) : null}

              {!viewerOwnsListing ? (
                <div className="mt-4 flex shrink-0 flex-wrap gap-2">
                  {item.freelancerUserId ? (
                    <StartConversationButton
                      otherUserId={item.freelancerUserId}
                      serviceInquiryId={existingInquiryId}
                      className="min-w-0 flex-1"
                    />
                  ) : null}
                  <Link
                    to={`/freelancer/${encodeURIComponent(item.freelancerSlug)}`}
                    className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-[#0088FF] px-3 text-sm font-semibold text-white hover:bg-[#006ACC]"
                  >
                    პროფილი
                  </Link>
                  <SaveBookmarkButton resourceType="freelancer" resourceId={item.freelancerProfileId} variant="icon" />
                </div>
              ) : null}

              {canMakeOffer ? (
                <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-slate-100 pt-4">
                  <p className="shrink-0 text-sm font-semibold text-[#1B2B4B]">შეთავაზება</p>
                  <textarea
                    value={offerMessage}
                    onChange={(event) => setOfferMessage(event.target.value)}
                    rows={2}
                    className="mt-2 w-full shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#0088FF] focus:ring-2"
                    placeholder="რა გჭირდება..."
                  />
                  <div className="mt-2 flex shrink-0 gap-2">
                    <input
                      type="number"
                      min={0}
                      value={offerBudget}
                      onChange={(event) => setOfferBudget(event.target.value)}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#0088FF] focus:ring-2"
                      placeholder="₾ (არასავალდებულო)"
                    />
                    <button
                      type="button"
                      onClick={() => void submitOffer()}
                      disabled={offerSubmitting}
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#1B2B4B] px-3 text-sm font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-60"
                    >
                      <SendOutlineIcon className="h-3.5 w-3.5" />
                      {offerSubmitting ? "..." : "გაგზავნა"}
                    </button>
                  </div>
                  {offerError ? <p className="mt-1.5 shrink-0 text-xs text-red-600">{offerError}</p> : null}
                </div>
              ) : null}
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}

