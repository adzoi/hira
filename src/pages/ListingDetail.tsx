import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import Navbar from "../components/Navbar"
import { stripLegacyPricePrefix } from "../lib/listingDescription.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { avatarImageUrl, serviceImageDetailUrl, serviceImageThumbnailUrl } from "../lib/storageImageUrl.ts"

type ListingMeta = {
  categoryId: string | null
  tags: string[]
}

const META_PREFIX = "<!--gigori-meta:"
const META_SUFFIX = "-->"

function parseListingDescription(raw: string | null): { description: string; meta: ListingMeta } {
  const fallback: ListingMeta = { categoryId: null, tags: [] }
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
  deliveryDays: number
  createdAt: string
  imageUrls: string[]
  fullName: string
  professionalTitle: string
  avatarUrl: string | null
  freelancerSlug: string
  averageRating: number
  viewsCount: number
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
  const [offerMessage, setOfferMessage] = useState("")
  const [offerBudget, setOfferBudget] = useState("")
  const [offerError, setOfferError] = useState("")
  const [offerSubmitting, setOfferSubmitting] = useState(false)
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
            delivery_days,
            views_count,
            created_at,
            image_urls,
            freelancer_profiles (
              slug,
              professional_title,
              average_rating,
              profiles:profiles!freelancer_profiles_user_id_fkey (
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
          profiles: { full_name: string | null; avatar_url: string | null } | null
        } | null
        if (!fp?.slug) throw new Error("ლისტინგი ვერ მოიძებნა.")

        setItem({
          id: data.id,
          freelancerProfileId: String(data.freelancer_profile_id ?? ""),
          title: data.title ?? "სერვისი",
          descriptionRaw: data.description,
          price: Number(data.price ?? 0),
          deliveryDays: Number(data.delivery_days ?? 0),
          createdAt: data.created_at ?? new Date().toISOString(),
          imageUrls: Array.isArray((data as { image_urls?: unknown }).image_urls)
            ? ((data as { image_urls: unknown[] }).image_urls.map((x) => String(x)).filter(Boolean).slice(0, 3))
            : [],
          fullName: fp.profiles?.full_name?.trim() || "ფრილანსერი",
          professionalTitle: fp.professional_title?.trim() || "ფრილანსერი",
          avatarUrl: fp.profiles?.avatar_url ?? null,
          freelancerSlug: fp.slug,
          averageRating: Number(fp.average_rating ?? 0),
          viewsCount: Number((data as { views_count?: number | null }).views_count ?? 0),
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
        return
      }
      const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", user.id).maybeSingle()
      const ut = profile?.user_type === "hirer" ? "hirer" : profile?.user_type === "freelancer" ? "freelancer" : null
      setViewerType(ut)
      if (ut === "freelancer") {
        const { data: fp } = await supabase.from("freelancer_profiles").select("id").eq("user_id", user.id).maybeSingle()
        setViewerFreelancerProfileId(fp?.id ?? null)
      } else {
        setViewerFreelancerProfileId(null)
      }
    }
    void loadViewer()
  }, [])

  const imagePublicUrls = useMemo(() => {
    if (!item || !supabase) return []
    return item.imageUrls.map((path) => ({
      thumb: serviceImageThumbnailUrl(supabase, path),
      detail: serviceImageDetailUrl(supabase, path),
    }))
  }, [item])

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

  const submitOffer = async () => {
    if (!item || !supabase) return
    setOfferError("")
    const message = offerMessage.trim()
    if (message.length < 10) {
      setOfferError("შეთავაზების ტექსტი მინიმუმ 10 სიმბოლო უნდა იყოს.")
      return
    }
    let proposedBudget: number | null = null
    const budgetRaw = offerBudget.trim()
    if (budgetRaw) {
      const n = Number(budgetRaw)
      if (!Number.isFinite(n) || n < 0) {
        setOfferError("შემოთავაზებული თანხა არასწორია.")
        return
      }
      proposedBudget = n
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
              <p className="mt-1 text-xs text-slate-500">{item.viewsCount} ნახვა</p>
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
              <Link to={`/freelancer/${encodeURIComponent(item.freelancerSlug)}`} className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-bold text-[#1B2B4B]">
                  {item.avatarUrl ? (
                    <img
                      src={avatarImageUrl(supabase, item.avatarUrl) ?? item.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    item.fullName.slice(0, 2).toUpperCase()
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold text-[#1B2B4B]">{item.fullName}</p>
                  <p className="truncate text-xs text-slate-600">{item.professionalTitle}</p>
                  <p className="mt-0.5 text-xs font-semibold text-[#D4A843]">★ {item.averageRating.toFixed(1)}</p>
                </div>
              </Link>

              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <p>
                  <span className="font-semibold text-[#1B2B4B]">ფასი:</span>{" "}
                  {item.price === 0 ? "შეთანხმებით" : `${item.price.toLocaleString("ka-GE")} ₾`}
                </p>
                <p>
                  <span className="font-semibold text-[#1B2B4B]">ვადა:</span> {Math.max(1, item.deliveryDays)} დღე
                </p>
                <p>
                  <span className="font-semibold text-[#1B2B4B]">დამატებულია:</span>{" "}
                  {new Date(item.createdAt).toLocaleDateString("ka-GE")}
                </p>
              </div>

              {parsed.meta.tags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {parsed.meta.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-5">
                <Link
                  to={`/freelancer/${encodeURIComponent(item.freelancerSlug)}`}
                  className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#1B2B4B] px-4 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B]"
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

