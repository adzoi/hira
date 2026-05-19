import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import Navbar from "../components/Navbar"
import { ViewCountEyeIcon } from "../components/ViewCountEyeIcon.tsx"
import SaveBookmarkButton from "../components/SaveBookmarkButton.tsx"
import StartConversationButton from "../components/StartConversationButton.tsx"
import { stripLegacyPricePrefix } from "../lib/listingDescription.ts"
import { formatListingPrice, normalizeListingPriceType } from "../lib/listingPrice.ts"
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

type ListingDetail = {
  id: string
  freelancerProfileId: string
  title: string
  descriptionRaw: string | null
  price: number
  priceType: string
  createdAt: string
  imageUrls: string[]
  fullName: string
  professionalTitle: string
  avatarUrl: string | null
  freelancerSlug: string
  freelancerUserId: string
  averageRating: number
  viewsCount: number
  isAcceptingNewWork: boolean
}

export default function ListingDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedImage, setSelectedImage] = useState(0)
  const [item, setItem] = useState<ListingDetail | null>(null)
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
    const run = async () => {
      if (!id) {
        setError("ლისტინგი ვერ მოიძებნა.")
        setLoading(false)
        return
      }
      if (!isSupabaseConfigured || !supabase) {
        setError("მონაცემთა ბაზა არ არის კონფიგურირებული.")
        setLoading(false)
        return
      }

      setLoading(true)
      setError("")
      try {
        const { data, error: qErr } = await supabase
          .from("services")
          .select(
            `
            id,
            freelancer_profile_id,
            title,
            description,
            price,
            price_type,
            views_count,
            created_at,
            image_urls,
            freelancer_profiles (
              slug,
              professional_title,
              average_rating,
              is_accepting_new_work,
              profiles:profiles!freelancer_profiles_user_id_fkey (
                id,
                full_name,
                avatar_url
              )
            )
          `,
          )
          .eq("id", id)
          .eq("is_active", true)
          .single()
        if (qErr || !data) throw new Error("ლისტინგი ვერ მოიძებნა.")

        const fpJoined = data.freelancer_profiles as unknown
        const fp = (Array.isArray(fpJoined) ? fpJoined[0] : fpJoined) as {
          slug: string | null
          professional_title: string | null
          average_rating: number | null
          is_accepting_new_work?: boolean | null
          profiles: { id: string; full_name: string | null; avatar_url: string | null } | null
        } | null
        if (!fp?.slug) throw new Error("ლისტინგი ვერ მოიძებნა.")

        setItem({
          id: data.id,
          freelancerProfileId: String(data.freelancer_profile_id ?? ""),
          title: data.title ?? "სერვისი",
          descriptionRaw: data.description,
          price: Number(data.price ?? 0),
          priceType: normalizeListingPriceType((data as { price_type?: string | null }).price_type),
          createdAt: data.created_at ?? new Date().toISOString(),
          imageUrls: Array.isArray((data as { image_urls?: unknown }).image_urls)
            ? ((data as { image_urls: unknown[] }).image_urls.map((x) => String(x)).filter(Boolean).slice(0, 3))
            : [],
          fullName: fp.profiles?.full_name?.trim() || "ფრილანსერი",
          professionalTitle: fp.professional_title?.trim() || "ფრილანსერი",
          avatarUrl: fp.profiles?.avatar_url ?? null,
          freelancerSlug: fp.slug,
          freelancerUserId: String(fp.profiles?.id ?? ""),
          averageRating: Number(fp.average_rating ?? 0),
          viewsCount: Number((data as { views_count?: number | null }).views_count ?? 0),
          isAcceptingNewWork: fp.is_accepting_new_work !== false,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : "ჩატვირთვა ვერ მოხერხდა.")
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [id])

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
        const { data, error } = await supabase.rpc("increment_service_views", { p_service_id: serviceId })
        if (error) {
          if (import.meta.env.DEV) console.warn("[ListingDetail] increment_service_views:", error.message)
          return
        }
        const next = Number(data ?? 0)
        if (!Number.isFinite(next)) return
        setItem((prev) => (prev && prev.id === serviceId ? { ...prev, viewsCount: next } : prev))
      } catch {
        /* non-blocking */
      }
    })()
  }, [id, item?.id])

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
    <div className="min-h-screen bg-[#F8F9FC] page-enter">
      <Navbar />
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6 md:py-10">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600">იტვირთება...</div>
        ) : error || !item ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            <p>{error || "ლისტინგი ვერ მოიძებნა."}</p>
            <Link to="/listings" className="mt-3 inline-block font-semibold text-[#1B2B4B] underline">
              დაბრუნდი ლისტინგებზე
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
              <h1 className="text-2xl font-extrabold text-[#1B2B4B]">{item.title}</h1>
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                <ViewCountEyeIcon className="h-3.5 w-3.5 shrink-0" />
                {item.viewsCount}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                {parsed.description || "დეტალური აღწერა ჯერ არ არის დამატებული."}
              </p>

              {imagePublicUrls.length > 0 ? (
                <div className="mt-5">
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                    <img
                      src={imagePublicUrls[Math.min(selectedImage, imagePublicUrls.length - 1)].detail}
                      alt=""
                      className="h-[320px] w-full object-cover"
                    />
                  </div>
                  {imagePublicUrls.length > 1 ? (
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {imagePublicUrls.map((urls, index) => (
                        <button
                          key={urls.thumb}
                          type="button"
                          onClick={() => setSelectedImage(index)}
                          className={`overflow-hidden rounded-lg border ${selectedImage === index ? "border-[#D4A843]" : "border-slate-200"}`}
                        >
                          <img src={urls.thumb} alt="" className="h-20 w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <aside className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
              <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <Link
                    to={`/freelancer/${encodeURIComponent(item.freelancerSlug)}`}
                    className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-bold text-[#1B2B4B]"
                  >
                    {item.avatarUrl ? (
                      <img
                        src={avatarImageUrl(supabase, item.avatarUrl) ?? item.avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      item.fullName.slice(0, 2).toUpperCase()
                    )}
                  </Link>
                  {!viewerOwnsListing ? (
                    <SaveBookmarkButton resourceType="service" resourceId={item.id} className="w-[88px]" />
                  ) : null}
                </div>
                <Link to={`/freelancer/${encodeURIComponent(item.freelancerSlug)}`} className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[#1B2B4B]">{item.fullName}</p>
                  <p className="truncate text-xs text-slate-600">{item.professionalTitle}</p>
                  <p className="mt-0.5 text-xs font-semibold text-[#D4A843]">{item.averageRating.toFixed(1)}</p>
                </Link>
              </div>

              {!item.isAcceptingNewWork ? (
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-snug text-amber-900">
                  ეს ფრილანსერი ამჟამად ახალი სამუშაოებისთვის ხელმიუწვდომელია. შეთავაზების გაგზავნა მაინც შეგიძლიათ.
                </p>
              ) : null}

              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <p>
                  <span className="font-semibold text-[#1B2B4B]">ფასი:</span>{" "}
                  {formatListingPrice(item.price, item.priceType)}
                </p>
                <p>
                  <span className="font-semibold text-[#1B2B4B]">დამატებულია:</span>{" "}
                  {new Date(item.createdAt).toLocaleDateString("ka-GE")}
                </p>
              </div>

              {subcategoryLabel ? (
                <p className="mt-4 text-sm text-slate-700">
                  <span className="font-semibold text-[#1B2B4B]">ქვეკატეგორია:</span> {subcategoryLabel}
                </p>
              ) : null}

              {parsed.meta.tags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {parsed.meta.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                {!viewerOwnsListing ? (
                  <SaveBookmarkButton
                    variant="icon"
                    resourceType="freelancer"
                    resourceId={item.freelancerProfileId}
                  />
                ) : null}
                {!viewerOwnsListing && item.freelancerUserId ? (
                  <StartConversationButton
                    otherUserId={item.freelancerUserId}
                    serviceInquiryId={existingInquiryId}
                    className="min-w-[10rem] flex-1"
                  />
                ) : null}
                <Link
                  to={`/freelancer/${encodeURIComponent(item.freelancerSlug)}`}
                  className="inline-flex h-11 min-w-[10rem] flex-1 items-center justify-center rounded-lg bg-[#1B2B4B] px-4 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B]"
                >
                  ფრილანსერის პროფილი
                </Link>
              </div>

              {canMakeOffer ? (
                <div className="mt-3 rounded-xl border border-[#D4A843]/40 bg-amber-50/40 p-3">
                  <p className="text-sm font-semibold text-[#1B2B4B]">შეთავაზება ამ ლისტინგზე</p>
                  <textarea
                    value={offerMessage}
                    onChange={(event) => setOfferMessage(event.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-[#D4A843] focus:ring-2"
                    placeholder="რა გჭირდება, ვადები, კონტექსტი..."
                  />
                  <input
                    type="number"
                    min={0}
                    value={offerBudget}
                    onChange={(event) => setOfferBudget(event.target.value)}
                    className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                    placeholder="შემოთავაზებული თანხა (₾, არასავალდებულო)"
                  />
                  {offerError ? <p className="mt-2 text-xs text-red-600">{offerError}</p> : null}
                  <button
                    type="button"
                    onClick={() => void submitOffer()}
                    disabled={offerSubmitting}
                    className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-lg border border-[#D4A843] bg-white px-4 text-sm font-semibold text-[#1B2B4B] transition hover:bg-[#D4A843]/20 disabled:opacity-60"
                  >
                    {offerSubmitting ? "იგზავნება..." : "შეთავაზების გაგზავნა"}
                  </button>
                </div>
              ) : null}
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}

