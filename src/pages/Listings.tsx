import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import EmptyState from "../components/ui/EmptyState.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import MarketplaceCatalogToolbar from "../components/MarketplaceCatalogToolbar.tsx"
import LocationFilterSelect from "../components/LocationFilterSelect.tsx"
import { useToast } from "../components/ui/ToastProvider.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { matchesLocationFilter } from "../lib/marketplaceFilters.ts"

type ListingMeta = { categoryId: string | null; tags: string[] }
type Availability = "full_time" | "part_time" | "weekends"
type SkillItem = { id: string; name: string; category_id: string | null }

const META_PREFIX = "<!--gigori-meta:"
const META_SUFFIX = "-->"

function parseListingDescription(raw: string | null): { description: string; meta: ListingMeta } {
  const fallback: ListingMeta = { categoryId: null, tags: [] }
  if (!raw) return { description: "", meta: fallback }
  if (!raw.startsWith(META_PREFIX)) {
    return { description: raw, meta: fallback }
  }
  const endIndex = raw.indexOf(META_SUFFIX)
  if (endIndex < 0) return { description: raw, meta: fallback }
  const metaChunk = raw.slice(META_PREFIX.length, endIndex).trim()
  const body = raw.slice(endIndex + META_SUFFIX.length).trimStart()
  try {
    const parsed = JSON.parse(metaChunk) as Partial<ListingMeta>
    return {
      description: body,
      meta: {
        categoryId: parsed.categoryId ?? null,
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20)
          : [],
      },
    }
  } catch {
    return { description: raw, meta: fallback }
  }
}

type SortOption = "newest" | "price_asc" | "price_desc" | "delivery"

type ListingRow = {
  id: string
  freelancerProfileId: string
  title: string
  descriptionRaw: string | null
  price: number
  deliveryDays: number
  createdAt: string
  freelancerSlug: string
  professionalTitle: string
  fullName: string
  avatarUrl: string | null
  city: string | null
  bio: string | null
  availability: string | null
  averageRating: number
  skillIds: string[]
  categoryId: string | null
  tags: string[]
}

type CategoryItem = { id: string; name_ka: string }

function getInitials(fullName: string) {
  const parts = fullName.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "ფ"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function isNegotiable(price: number, description: string) {
  if (price === 0) return true
  return description.toLowerCase().includes("შეთანხმებით")
}

function listingMatchesSkillIds(item: ListingRow, skillIds: string[], skillById: Map<string, SkillItem>): boolean {
  if (skillIds.length === 0) return true
  return skillIds.every((id) => {
    if (item.skillIds.includes(id)) return true
    const skill = skillById.get(id)
    if (!skill) return false
    const nameLower = skill.name.trim().toLowerCase()
    return item.tags.some((t) => t.trim().toLowerCase() === nameLower)
  })
}

const mockListings: ListingRow[] = [
  {
    id: "mock-1",
    freelancerProfileId: "00000000-0000-4000-8000-000000000001",
    title: "React პაკეტი — პატარა ფიჩერების შექმნა",
    descriptionRaw: "<!--gigori-meta:{\"categoryId\":null,\"tags\":[\"React\",\"TypeScript\"]}-->ლეიაუტის აწყობა, ფორმების დაკავშირება API-თან.",
    price: 450,
    deliveryDays: 5,
    createdAt: new Date().toISOString(),
    freelancerSlug: "giorgi-beridze",
    professionalTitle: "Full-Stack Developer",
    fullName: "გიორგი ბერიძე",
    avatarUrl: null,
    city: "თბილისი",
    bio: null,
    availability: "full_time",
    averageRating: 4.8,
    skillIds: [],
    categoryId: null,
    tags: ["React", "TypeScript"],
  },
  {
    id: "mock-2",
    freelancerProfileId: "00000000-0000-4000-8000-000000000002",
    title: "UI/UX რევიუს პაკეტი (Figma)",
    descriptionRaw: "ვახდენთ ინტერფეისის აუდიტს და იუზაბილითის რეკომენდაციებს.",
    price: 280,
    deliveryDays: 3,
    createdAt: new Date().toISOString(),
    freelancerSlug: "nino-kapanadze",
    professionalTitle: "UI Designer",
    fullName: "ნინო კაპანაძე",
    avatarUrl: null,
    city: "თბილისი",
    bio: null,
    availability: "part_time",
    averageRating: 4.9,
    skillIds: [],
    categoryId: null,
    tags: [],
  },
]

export default function ListingsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { pushToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [listings, setListings] = useState<ListingRow[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [searchText, setSearchText] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("newest")
  const [visibleCount, setVisibleCount] = useState(24)

  const [advancedDropdownOpen, setAdvancedDropdownOpen] = useState(false)
  const advancedDropdownRef = useRef<HTMLDivElement>(null)

  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [availabilityFilters, setAvailabilityFilters] = useState<Availability[]>([])
  const [minimumRating, setMinimumRating] = useState<0 | 3 | 4 | 5>(0)
  const [minPrice, setMinPrice] = useState("")
  const [maxPrice, setMaxPrice] = useState("")
  const [locationFilter, setLocationFilter] = useState("")

  const [draftSkillIds, setDraftSkillIds] = useState<string[]>([])
  const [draftAvailability, setDraftAvailability] = useState<Availability[]>([])
  const [draftMinRating, setDraftMinRating] = useState<0 | 3 | 4 | 5>(0)
  const [draftMinPrice, setDraftMinPrice] = useState("")
  const [draftMaxPrice, setDraftMaxPrice] = useState("")
  const [draftLocationFilter, setDraftLocationFilter] = useState("")

  const [viewerType, setViewerType] = useState<"hirer" | "freelancer" | null>(null)
  const [viewerFreelancerProfileId, setViewerFreelancerProfileId] = useState<string | null>(null)
  const [inquiryListing, setInquiryListing] = useState<ListingRow | null>(null)
  const [inquiryMessage, setInquiryMessage] = useState("")
  const [inquiryBudget, setInquiryBudget] = useState("")
  const [inquirySubmitting, setInquirySubmitting] = useState(false)
  const [inquiryFormError, setInquiryFormError] = useState("")
  const [pendingScrollToListingId, setPendingScrollToListingId] = useState<string | null>(null)
  const [flashListingId, setFlashListingId] = useState<string | null>(null)

  useEffect(() => {
    const loadViewer = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setViewerType(null)
        setViewerFreelancerProfileId(null)
        return
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setViewerType(null)
        setViewerFreelancerProfileId(null)
        return
      }
      const { data: prof } = await supabase.from("profiles").select("user_type").eq("id", user.id).maybeSingle()
      const ut = prof?.user_type === "hirer" ? "hirer" : prof?.user_type === "freelancer" ? "freelancer" : null
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

  const openListingInquiry = (item: ListingRow) => {
    setInquiryFormError("")
    setInquiryMessage("")
    setInquiryBudget("")
    setInquiryListing(item)
  }

  const submitListingInquiry = async () => {
    if (!isSupabaseConfigured || !supabase || !inquiryListing) return
    const msg = inquiryMessage.trim()
    if (msg.length < 10) {
      setInquiryFormError("შეტყობინება მინიმუმ 10 სიმბოლო უნდა იყოს.")
      return
    }
    let proposed: number | null = null
    const rawB = inquiryBudget.trim()
    if (rawB) {
      const n = Number(rawB)
      if (!Number.isFinite(n) || n < 0) {
        setInquiryFormError("შემოთავაზებული თანხა არასწორია.")
        return
      }
      proposed = n
    }
    setInquirySubmitting(true)
    setInquiryFormError("")
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        navigate(`/login?redirect=${encodeURIComponent("/listings")}`)
        return
      }
      const [{ data: hp, error: hpErr }, { data: myFp }] = await Promise.all([
        supabase.from("hirer_profiles").select("id").eq("user_id", user.id).maybeSingle(),
        supabase.from("freelancer_profiles").select("id").eq("user_id", user.id).maybeSingle(),
      ])
      if (hpErr) throw hpErr
      if (!hp) {
        setInquiryFormError("დამქირავებლის პროფილი საჭიროა (პროფილი / რეგისტრაცია).")
        return
      }
      if (myFp?.id === inquiryListing.freelancerProfileId) {
        setInquiryFormError("საკუთარ ლისტინგზე შეთავაზება ვერ გაიგზავნება.")
        return
      }
      const { error: insErr } = await supabase.from("service_inquiries").insert({
        service_id: inquiryListing.id,
        hirer_profile_id: hp.id,
        freelancer_profile_id: inquiryListing.freelancerProfileId,
        message: msg,
        proposed_budget: proposed,
        status: "pending",
      })
      if (insErr) throw insErr
      setInquiryListing(null)
      pushToast({ type: "success", message: "შეთავაზება გაიგზავნა. ფრილანსერს შეტყობინება მივიდა." })
    } catch (e) {
      const m = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "გაგზავნა ვერ მოხერხდა."
      setInquiryFormError(m)
    } finally {
      setInquirySubmitting(false)
    }
  }

  useEffect(() => {
    document.title = "სერვისების ლისტინგები — გიგორი"
    return () => {
      document.title = "გიგორი"
    }
  }, [])

  useEffect(() => {
    if (!advancedDropdownOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAdvancedDropdownOpen(false)
    }
    const onPointerDown = (event: PointerEvent) => {
      const el = advancedDropdownRef.current
      if (el && !el.contains(event.target as Node)) {
        setAdvancedDropdownOpen(false)
      }
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [advancedDropdownOpen])

  useEffect(() => {
    const load = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setListings(mockListings)
        setCategories([])
        setSkills([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError("")
      try {
        const [servicesRes, catRes, skillsRes] = await Promise.all([
          supabase
            .from("services")
            .select(
              `
              id,
              freelancer_profile_id,
              title,
              description,
              price,
              delivery_days,
              created_at,
              freelancer_profiles (
                slug,
                professional_title,
                is_public,
                bio,
                availability,
                average_rating,
                profiles:profiles!freelancer_profiles_user_id_fkey (
                  full_name,
                  avatar_url,
                  city
                ),
                freelancer_skills (
                  skills (id, name)
                )
              )
            `,
            )
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(120),
          supabase.from("categories").select("id,name_ka").eq("is_active", true).order("sort_order"),
          supabase.from("skills").select("id,name,category_id").eq("is_approved", true).order("name").limit(200),
        ])

        if (servicesRes.error) throw servicesRes.error
        if (catRes.error) console.warn(catRes.error)
        if (skillsRes.error) console.warn(skillsRes.error)

        const mapped: ListingRow[] = []
        for (const row of servicesRes.data ?? []) {
          const fp = row.freelancer_profiles as unknown as null | {
            slug: string | null
            professional_title: string | null
            is_public: boolean | null
            bio: string | null
            availability: string | null
            average_rating: number | null
            profiles: null | {
              full_name: string | null
              avatar_url: string | null
              city: string | null
            }
            freelancer_skills?: Array<{ skills: null | { id: string; name: string } }>
          }
          if (!fp?.slug || fp.is_public === false) continue
          const prof = fp.profiles
          const parsed = parseListingDescription(row.description ?? null)
          const fsRows = fp.freelancer_skills ?? []
          const skillIds = fsRows
            .map((x) => x.skills?.id)
            .filter((x): x is string => Boolean(x))
          mapped.push({
            id: row.id,
            freelancerProfileId: String(row.freelancer_profile_id ?? ""),
            title: row.title ?? "სერვისი",
            descriptionRaw: row.description,
            price: Number(row.price ?? 0),
            deliveryDays: Number(row.delivery_days ?? 0),
            createdAt: row.created_at ?? new Date().toISOString(),
            freelancerSlug: fp.slug,
            professionalTitle: fp.professional_title ?? "",
            fullName: prof?.full_name?.trim() || "ფრილანსერი",
            avatarUrl: prof?.avatar_url ?? null,
            city: prof?.city ?? null,
            bio: fp.bio ?? null,
            availability: fp.availability ?? null,
            averageRating: Number(fp.average_rating ?? 0),
            skillIds,
            categoryId: parsed.meta.categoryId,
            tags: parsed.meta.tags,
          })
        }

        setListings(mapped)
        if (!catRes.error) {
          setCategories((catRes.data ?? []).map((c) => ({ id: c.id, name_ka: c.name_ka })))
        }
        if (!skillsRes.error) {
          setSkills((skillsRes.data ?? []) as SkillItem[])
        }
      } catch (e) {
        const message =
          e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message)
            : "მონაცემების ჩატვირთვა ვერ მოხერხდა."
        setError(message)
        setListings([])
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const skillById = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills])

  const topSkills = useMemo(() => {
    const countBySkillId = listings.reduce<Record<string, number>>((acc, item) => {
      item.skillIds.forEach((sid) => {
        acc[sid] = (acc[sid] ?? 0) + 1
      })
      return acc
    }, {})
    return [...skills]
      .sort((a, b) => (countBySkillId[b.id] ?? 0) - (countBySkillId[a.id] ?? 0))
      .slice(0, 15)
  }, [listings, skills])

  const openAdvancedDropdown = () => {
    setDraftSkillIds([...selectedSkillIds])
    setDraftAvailability([...availabilityFilters])
    setDraftMinRating(minimumRating)
    setDraftMinPrice(minPrice)
    setDraftMaxPrice(maxPrice)
    setDraftLocationFilter(locationFilter)
    setAdvancedDropdownOpen(true)
  }

  const saveAdvancedFilters = () => {
    setSelectedSkillIds([...draftSkillIds])
    setAvailabilityFilters([...draftAvailability])
    setMinimumRating(draftMinRating)
    setMinPrice(draftMinPrice)
    setMaxPrice(draftMaxPrice)
    setLocationFilter(draftLocationFilter)
    setAdvancedDropdownOpen(false)
  }

  const clearDraftAdvanced = () => {
    setDraftSkillIds([])
    setDraftAvailability([])
    setDraftMinRating(0)
    setDraftMinPrice("")
    setDraftMaxPrice("")
    setDraftLocationFilter("")
  }

  const availabilityLabel: Record<Availability, string> = {
    full_time: "სრული განაკვეთი",
    part_time: "ნახევარი განაკვეთი",
    weekends: "შაბათ-კვირა",
  }

  const toggleDraftAvailability = (value: Availability) => {
    setDraftAvailability((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]))
  }

  const toggleDraftSkill = (skillId: string) => {
    setDraftSkillIds((prev) => (prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]))
  }

  const clearFilters = () => {
    setSearchText("")
    setCategoryId("")
    setSelectedSkillIds([])
    setAvailabilityFilters([])
    setMinimumRating(0)
    setMinPrice("")
    setMaxPrice("")
    setLocationFilter("")
    clearDraftAdvanced()
    setAdvancedDropdownOpen(false)
    setSortBy("newest")
    setVisibleCount(24)
  }

  const advancedFilterCount = useMemo(() => {
    let n = 0
    if (selectedSkillIds.length > 0) n += selectedSkillIds.length
    if (availabilityFilters.length > 0) n += availabilityFilters.length
    if (minimumRating > 0) n += 1
    if (minPrice.trim()) n += 1
    if (maxPrice.trim()) n += 1
    if (locationFilter.trim()) n += 1
    return n
  }, [selectedSkillIds, availabilityFilters, minimumRating, minPrice, maxPrice, locationFilter])

  const filteredSorted = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    const minPriceNumber = minPrice ? Number(minPrice) : null
    const maxPriceNumber = maxPrice ? Number(maxPrice) : null

    let list = listings.filter((item) => {
      const { description } = parseListingDescription(item.descriptionRaw)
      const negotiable = isNegotiable(item.price, description)

      if (categoryId && item.categoryId !== categoryId) return false

      if (!listingMatchesSkillIds(item, selectedSkillIds, skillById)) return false

      const hasAvailability =
        availabilityFilters.length === 0 ||
        (item.availability !== null && availabilityFilters.includes(item.availability as Availability))
      if (!hasAvailability) return false

      if (minimumRating > 0 && item.averageRating < minimumRating) return false

      if (minPriceNumber !== null || maxPriceNumber !== null) {
        if (negotiable) {
          /* skip strict price bounds for negotiable offers */
        } else {
          if (minPriceNumber !== null && item.price < minPriceNumber) return false
          if (maxPriceNumber !== null && item.price > maxPriceNumber) return false
        }
      }

      if (
        !matchesLocationFilter(
          {
            city: item.city,
            bio: `${item.bio ?? ""} ${description}`.trim() || item.bio,
            professionalTitle: item.professionalTitle,
          },
          locationFilter,
        )
      ) {
        return false
      }

      if (!q) return true
      const hay = `${item.title} ${item.tags.join(" ")} ${item.professionalTitle} ${item.fullName} ${description}`.toLowerCase()
      return hay.includes(q)
    })

    list = [...list].sort((a, b) => {
      if (sortBy === "price_asc") return a.price - b.price
      if (sortBy === "price_desc") return b.price - a.price
      if (sortBy === "delivery") return a.deliveryDays - b.deliveryDays
      return +new Date(b.createdAt) - +new Date(a.createdAt)
    })
    return list
  }, [
    listings,
    searchText,
    categoryId,
    sortBy,
    selectedSkillIds,
    skillById,
    availabilityFilters,
    minimumRating,
    minPrice,
    maxPrice,
    locationFilter,
  ])

  const visible = filteredSorted.slice(0, visibleCount)

  const openListingQueryId = searchParams.get("open")

  useEffect(() => {
    if (loading || !openListingQueryId) return
    const idx = filteredSorted.findIndex((x) => x.id === openListingQueryId)
    const openId = openListingQueryId

    const run = () => {
      if (idx < 0) {
        setSearchParams(
          (p) => {
            p.delete("open")
            return p
          },
          { replace: true },
        )
        return
      }
      setVisibleCount((c) => Math.max(c, idx + 1))
      setPendingScrollToListingId(openId)
    }

    const t = window.setTimeout(run, 0)
    return () => window.clearTimeout(t)
  }, [loading, openListingQueryId, filteredSorted, setSearchParams])

  useEffect(() => {
    if (!pendingScrollToListingId) return
    if (!visible.some((v) => v.id === pendingScrollToListingId)) return

    const id = pendingScrollToListingId

    const run = () => {
      requestAnimationFrame(() => {
        document.getElementById(`listing-card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
      })
      setFlashListingId(id)
      window.setTimeout(() => setFlashListingId(null), 2800)
      setPendingScrollToListingId(null)
      setSearchParams(
        (p) => {
          p.delete("open")
          return p
        },
        { replace: true },
      )
    }

    const t = window.setTimeout(run, 0)
    return () => window.clearTimeout(t)
  }, [pendingScrollToListingId, visible, setSearchParams])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FC]">
        <Navbar />
        <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] page-enter">
      <Navbar />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
        <MarketplaceCatalogToolbar
          eyebrow="მარკეტპლეისი"
          title="ფრილანსერების ლისტინგები"
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="საკვანძო სიტყვა, სათაური ან დამამრგვარებლი"
          categories={categories}
          categoryId={categoryId}
          onCategoryChange={setCategoryId}
          sortValue={sortBy}
          onSortChange={(value) => setSortBy(value as SortOption)}
          sortOptions={[
            { value: "newest", label: "უახლესი" },
            { value: "price_asc", label: "ფასი ▲" },
            { value: "price_desc", label: "ფასი ▼" },
            { value: "delivery", label: "მოკლე ვადა" },
          ]}
          advancedDropdownOpen={advancedDropdownOpen}
          advancedFilterCount={advancedFilterCount}
          onToggleAdvanced={openAdvancedDropdown}
          advancedDropdownRef={advancedDropdownRef}
          onDismissAdvanced={() => setAdvancedDropdownOpen(false)}
          onSaveAdvanced={saveAdvancedFilters}
          onClearDraftAdvanced={clearDraftAdvanced}
          childrenAdvancedBody={
            <>
              <div>
                <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">უნარები</p>
                <div className="max-h-40 space-y-2 overflow-auto rounded-lg border border-slate-200 p-2">
                  {topSkills.map((skill) => (
                    <label key={skill.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={draftSkillIds.includes(skill.id)} onChange={() => toggleDraftSkill(skill.id)} />
                      {skill.name}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">დატვირთვა</p>
                <div className="space-y-2">
                  {(Object.keys(availabilityLabel) as Availability[]).map((value) => (
                    <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={draftAvailability.includes(value)} onChange={() => toggleDraftAvailability(value)} />
                      {availabilityLabel[value]}
                    </label>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">მინ. რეიტინგი (ფრილანსერი)</span>
                <select
                  value={draftMinRating}
                  onChange={(event) => setDraftMinRating(Number(event.target.value) as 0 | 3 | 4 | 5)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                >
                  <option value={0}>ნებისმიერი</option>
                  <option value={3}>3+</option>
                  <option value={4}>4+</option>
                  <option value={5}>5</option>
                </select>
              </label>

              <div>
                <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">ფასის დიაპაზონი (ლისტინგი ₾)</p>
                <p className="mb-2 text-xs text-slate-500">შეთანხმებით ფასები ფასის საზღვრებს არ ექვემდებარება.</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    value={draftMinPrice}
                    onChange={(event) => setDraftMinPrice(event.target.value)}
                    placeholder="მინ"
                    className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                  />
                  <input
                    type="number"
                    min={0}
                    value={draftMaxPrice}
                    onChange={(event) => setDraftMaxPrice(event.target.value)}
                    placeholder="მაქს"
                    className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                  />
                </div>
              </div>

              <label className="block pb-1">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">ლოკაცია / ქალაქი</span>
                <LocationFilterSelect
                  value={draftLocationFilter}
                  onChange={setDraftLocationFilter}
                  className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                />
              </label>
            </>
          }
        />

        <p className="mt-4 text-sm text-slate-600">{filteredSorted.length} აქტიური შეთავაში</p>

        {error ? <ErrorState message={error} /> : null}

        {!error && filteredSorted.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              message="ახლა საჯარო აქტიური სერვისები არ ჩანს. სცადეთ განსხვავებული ძიება ან მოგვიანებით."
              actionLabel="ფილტრების გასუფთავება"
              onAction={clearFilters}
            />
          </div>
        ) : (
          <>
            {!error ? (
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((item) => {
                  const { description } = parseListingDescription(item.descriptionRaw)
                  const negotiable = isNegotiable(item.price, description)
                  const snippet =
                    description.length > 120 ? `${description.slice(0, 120)}…` : description || "დეტალური აღწერა გიგორში."
                  return (
                    <li
                      id={`listing-card-${item.id}`}
                      key={item.id}
                      className={`flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#D4A843]/70 ${
                        flashListingId === item.id ? "ring-2 ring-[#D4A843] ring-offset-2 ring-offset-[#F8F9FC]" : ""
                      }`}
                    >
                      <Link to={`/freelancer/${item.freelancerSlug}`} className="group flex shrink-0 items-center gap-3 border-b border-slate-100 pb-3">
                        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-bold text-[#1B2B4B]">
                          {item.avatarUrl ? (
                            <img src={item.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            getInitials(item.fullName)
                          )}
                        </span>
                        <div className="min-w-0 text-left">
                          <p className="truncate text-sm font-bold text-[#1B2B4B] group-hover:text-[#D4A843]">{item.fullName}</p>
                          <p className="truncate text-xs text-slate-600">{item.professionalTitle || item.city || "Georgian freelancer"}</p>
                        </div>
                      </Link>

                      <h2 className="mt-3 line-clamp-2 text-base font-extrabold text-[#1B2B4B]">{item.title}</h2>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-700">{snippet}</p>

                      {item.tags.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {item.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-slate-100 pt-3">
                        <div>
                          <p className="text-xs font-semibold uppercase text-slate-500">{negotiable ? "ფასი" : "ფასი / ვადა"}</p>
                          <p className="text-lg font-extrabold text-[#1B2B4B]">
                            {negotiable ? "შეთანხმებით" : `${item.price.toLocaleString("ka-GE")} ₾`}
                          </p>
                          {!negotiable ? <p className="text-xs text-slate-600">{item.deliveryDays} სამუშაო დღე</p> : null}
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          {viewerType === "hirer" && viewerFreelancerProfileId !== item.freelancerProfileId ? (
                            <button
                              type="button"
                              onClick={() => openListingInquiry(item)}
                              className="inline-flex h-10 items-center rounded-lg border border-[#D4A843] bg-amber-50 px-4 text-sm font-semibold text-[#1B2B4B] transition hover:bg-[#D4A843]/40"
                            >
                              შეთავაზება
                            </button>
                          ) : null}
                          <Link
                            to={`/freelancer/${item.freelancerSlug}`}
                            className="inline-flex h-10 items-center rounded-lg bg-[#1B2B4B] px-4 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B]"
                          >
                            პროფილი
                          </Link>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : null}

            {!error && visible.length < filteredSorted.length ? (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + 24)}
                  className="rounded-lg border border-[#D4A843] px-6 py-3 text-sm font-semibold text-[#1B2B4B] hover:bg-amber-50"
                >
                  მეტის ნახვა
                </button>
              </div>
            ) : null}
          </>
        )}

        {inquiryListing ? (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setInquiryListing(null)
            }}
          >
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <h3 className="text-lg font-bold text-[#1B2B4B]">შეთავაზება ფრილანსერს</h3>
              <p className="mt-1 text-sm text-slate-600 line-clamp-2">{inquiryListing.title}</p>
              <p className="mt-2 text-xs text-slate-500">
                ტექსტი გამოჩნდება ფრილანსერის დაშბორდზე „შეთავაზებები ლისტინგებზე“. სამუშაოს დასრულება იქვე ფიქსირდება (სტატუსი „დასრულებული“) — განცხადების გარეშე.
              </p>
              <label className="mt-4 block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">შეტყობინება</span>
                <textarea
                  value={inquiryMessage}
                  onChange={(e) => setInquiryMessage(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#D4A843] focus:ring-2"
                  placeholder="რა გჭირდება, ვადები, კონტექსტი…"
                />
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">შემოთავაზებული თანხა (₾, არასავალდებულო)</span>
                <input
                  type="number"
                  min={0}
                  value={inquiryBudget}
                  onChange={(e) => setInquiryBudget(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                  placeholder="მაგ. 500"
                />
              </label>
              {inquiryFormError ? <p className="mt-2 text-sm text-red-600">{inquiryFormError}</p> : null}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={inquirySubmitting}
                  onClick={() => void submitListingInquiry()}
                  className="flex-1 rounded-lg bg-[#1B2B4B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-60"
                >
                  {inquirySubmitting ? "იგზავნება…" : "გაგზავნა"}
                </button>
                <button
                  type="button"
                  disabled={inquirySubmitting}
                  onClick={() => setInquiryListing(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  გაუქმება
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
