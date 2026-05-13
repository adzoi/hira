import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import EmptyState from "../components/ui/EmptyState.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import FreelancerAvailabilityIndicator from "../components/FreelancerAvailabilityIndicator.tsx"
import SaveBookmarkButton from "../components/SaveBookmarkButton.tsx"
import LocationFilterSelect from "../components/LocationFilterSelect.tsx"
import { useToast } from "../components/ui/ToastProvider.tsx"
import { stripLegacyPricePrefix } from "../lib/listingDescription.ts"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { mergeFreelancerCompletedWorkCounts } from "../lib/freelancerCompletedWorkCounts.ts"
import { formatCityForDisplay, matchesLocationFilter } from "../lib/marketplaceFilters.ts"
import {
  catalogSelectionMatchesEntity,
  categoryChildrenOf,
  categoryRoots,
  effectiveCatalogFilterId,
  type CategoryBranchRow,
} from "../lib/marketplaceCategoryTree.ts"
import { ViewCountEyeIcon } from "../components/ViewCountEyeIcon.tsx"
type ListingMeta = { categoryId: string | null; subcategoryId: string | null; tags: string[] }
type Availability = "full_time" | "part_time" | "weekends"
type SkillItem = { id: string; name: string; category_id: string | null }

const META_PREFIX = "<!--gigori-meta:"
const META_SUFFIX = "-->"

function parseListingDescription(raw: string | null): { description: string; meta: ListingMeta } {
  const fallback: ListingMeta = { categoryId: null, subcategoryId: null, tags: [] }
  if (!raw) return { description: "", meta: fallback }
  if (!raw.startsWith(META_PREFIX)) return { description: stripLegacyPricePrefix(raw), meta: fallback }
  const endIndex = raw.indexOf(META_SUFFIX)
  if (endIndex < 0) return { description: stripLegacyPricePrefix(raw), meta: fallback }
  const metaChunk = raw.slice(META_PREFIX.length, endIndex).trim()
  const body = stripLegacyPricePrefix(raw.slice(endIndex + META_SUFFIX.length))
  try {
    const parsed = JSON.parse(metaChunk) as Partial<ListingMeta>
    return {
      description: body,
      meta: {
        categoryId: parsed.categoryId ?? null,
        subcategoryId: parsed.subcategoryId ?? null,
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20)
          : [],
      },
    }
  } catch {
    return { description: stripLegacyPricePrefix(raw), meta: fallback }
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
  /** Mirrors freelancer_profiles.is_accepting_new_work (false = busy / unavailable banner). */
  isAcceptingNewWork: boolean
  averageRating: number
  completedJobsCount: number
  viewsCount: number
  skillIds: string[]
  categoryId: string | null
  subcategoryId: string | null
  tags: string[]
  vipActive: boolean
}

type CategoryItem = { id: string; name_ka: string; parent_id: string | null }

function getInitials(fullName: string) {
  const parts = fullName.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "ფ"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function isNegotiable(price: number, description: string) {
  if (price === 0) return true
  return description.toLowerCase().includes("შეთანხმებით")
}

function ratingStars(value: number) {
  const rounded = Math.round(value)
  return `${"★".repeat(Math.max(0, rounded))}${"☆".repeat(Math.max(0, 5 - rounded))}`
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

const LISTINGS_PAGE_SIZE = 20
const COMPLETED_WORK_COUNT_CACHE_TTL_MS = 300_000
const completedWorkCountCache = new Map<string, { count: number; timestamp: number }>()

type ListingsSupabaseClient = NonNullable<typeof supabase>

async function getCachedCompletedWorkCounts(
  client: ListingsSupabaseClient,
  freelancerProfileIds: string[],
  fallbackJobsCountByFreelancerId: Record<string, number>,
): Promise<Record<string, number>> {
  const now = Date.now()
  const ids = [...new Set(freelancerProfileIds.filter(Boolean))]
  if (ids.length === 0) return {}

  const result: Record<string, number> = {}
  const missingOrExpired: string[] = []

  for (const id of ids) {
    const cached = completedWorkCountCache.get(id)
    if (cached && now - cached.timestamp < COMPLETED_WORK_COUNT_CACHE_TTL_MS) {
      result[id] = cached.count
      continue
    }
    if (cached) completedWorkCountCache.delete(id)
    missingOrExpired.push(id)
  }

  if (missingOrExpired.length > 0) {
    const fetchedCounts = await mergeFreelancerCompletedWorkCounts(client, missingOrExpired, fallbackJobsCountByFreelancerId)
    for (const id of missingOrExpired) {
      const count = Number(fetchedCounts[id] ?? fallbackJobsCountByFreelancerId[id] ?? 0)
      result[id] = count
      completedWorkCountCache.set(id, { count, timestamp: now })
    }
  }

  return result
}

const mockListings: ListingRow[] = [
  {
    id: "mock-1",
    freelancerProfileId: "00000000-0000-4000-8000-000000000001",
    title: "React პაკეტი — პატარა ფიჩერების შექმნა",
    descriptionRaw:
      '<!--gigori-meta:{"categoryId":null,"subcategoryId":null,"tags":["React","TypeScript"]}-->ლეიაუტის აწყობა, ფორმების დაკავშირება API-თან.',
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
    isAcceptingNewWork: true,
    averageRating: 4.8,
    completedJobsCount: 31,
    viewsCount: 0,
    skillIds: [],
    categoryId: null,
    subcategoryId: null,
    tags: ["React", "TypeScript"],
    vipActive: false,
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
    isAcceptingNewWork: true,
    averageRating: 4.9,
    completedJobsCount: 22,
    viewsCount: 0,
    skillIds: [],
    categoryId: null,
    subcategoryId: null,
    tags: [],
    vipActive: false,
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
  const [subcategoryNamesById, setSubcategoryNamesById] = useState<Map<string, string>>(() => new Map())
  const [subcategoryParentById, setSubcategoryParentById] = useState<Map<string, string>>(() => new Map())
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [searchText, setSearchText] = useState("")
  const [filterRootCategoryId, setFilterRootCategoryId] = useState("")
  const [filterMidCategoryId, setFilterMidCategoryId] = useState("")
  const [filterSpecializationId, setFilterSpecializationId] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("newest")
  const [listingsTotal, setListingsTotal] = useState(0)
  const [listingsNextOffset, setListingsNextOffset] = useState(0)
  const listingsNextOffsetRef = useRef(0)
  const [listingsLoadingMore, setListingsLoadingMore] = useState(false)

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

  const [viewerType, setViewerType] = useState<"hirer" | "freelancer" | null>(null)
  const [viewerFreelancerProfileId, setViewerFreelancerProfileId] = useState<string | null>(null)
  const [inquiryListing, setInquiryListing] = useState<ListingRow | null>(null)
  const [inquiryMessage, setInquiryMessage] = useState("")
  const [inquiryBudget, setInquiryBudget] = useState("")
  const [inquirySubmitting, setInquirySubmitting] = useState(false)
  const [inquiryFormError, setInquiryFormError] = useState("")
  const [pendingScrollToListingId, setPendingScrollToListingId] = useState<string | null>(null)
  const [flashListingId, setFlashListingId] = useState<string | null>(null)

  const categoryRows = categories as CategoryBranchRow[]
  const categoryRootsList = useMemo(() => categoryRoots(categoryRows), [categoryRows])
  const categoryMidsList = useMemo(
    () => (filterRootCategoryId ? categoryChildrenOf(categoryRows, filterRootCategoryId) : []),
    [categoryRows, filterRootCategoryId],
  )
  const specializationParentCategoryId = useMemo(() => {
    if (filterMidCategoryId.trim()) return filterMidCategoryId.trim()
    if (filterRootCategoryId && categoryMidsList.length === 0) return filterRootCategoryId.trim()
    return ""
  }, [filterMidCategoryId, filterRootCategoryId, categoryMidsList.length])

  const specializationOptions = useMemo(() => {
    const parent = specializationParentCategoryId
    if (!parent) return [] as { id: string; name_ka: string }[]
    const out: { id: string; name_ka: string }[] = []
    for (const [subId, catId] of subcategoryParentById) {
      if (catId === parent) {
        const name = (subcategoryNamesById.get(subId) ?? "").trim()
        if (subId && name) out.push({ id: subId, name_ka: name })
      }
    }
    return out.sort((a, b) => a.name_ka.localeCompare(b.name_ka, "ka"))
  }, [specializationParentCategoryId, subcategoryParentById, subcategoryNamesById])

  const catalogFilterEffectiveId = useMemo(
    () => effectiveCatalogFilterId(filterRootCategoryId, filterMidCategoryId, filterSpecializationId),
    [filterRootCategoryId, filterMidCategoryId, filterSpecializationId],
  )

  const serverCategoryForFetch = useMemo(() => {
    const spec = filterSpecializationId.trim()
    if (spec) {
      const p = (subcategoryParentById.get(spec) ?? "").trim()
      if (p) return p
    }
    const mid = filterMidCategoryId.trim()
    if (mid) return mid
    return filterRootCategoryId.trim() || undefined
  }, [filterSpecializationId, filterMidCategoryId, filterRootCategoryId, subcategoryParentById])

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

  const fetchListingsPage = useCallback(
    async (append: boolean) => {
      if (!isSupabaseConfigured || !supabase) {
        setListings(mockListings)
        setCategories([])
        setSubcategoryNamesById(new Map())
        setSubcategoryParentById(new Map())
        setSkills([])
        listingsNextOffsetRef.current = mockListings.length
        setListingsNextOffset(mockListings.length)
        setListingsTotal(mockListings.length)
        setLoading(false)
        setListingsLoadingMore(false)
        return
      }

      if (!append) {
        listingsNextOffsetRef.current = 0
        setListingsNextOffset(0)
        setLoading(true)
      } else {
        setListingsLoadingMore(true)
      }
      setError("")
      try {
        const offset = append ? listingsNextOffsetRef.current : 0
        const page = Math.floor(offset / LISTINGS_PAGE_SIZE) + 1
        const category = serverCategoryForFetch
        const { data, error: fnErr } = await supabase.functions.invoke("get-listings-page", {
          body: { category, page },
        })
        if (fnErr) throw fnErr
        if (!data || typeof data !== "object" || !("ok" in data) || (data as { ok?: unknown }).ok !== true) {
          const errMsg =
            data && typeof data === "object" && "error" in data
              ? String((data as { error?: unknown }).error)
              : "მონაცემების ჩატვირთვა ვერ მოხერხდა."
          throw new Error(errMsg)
        }

        const payload = (data as { data: unknown }).data as null | {
          services?: unknown
          categories?: unknown
          skills?: unknown
          total?: unknown
          total_count?: unknown
        }
        const servicesData = Array.isArray(payload?.services) ? payload.services : []
        const categoriesData = Array.isArray(payload?.categories) ? payload.categories : []
        const skillsPayload = Array.isArray(payload?.skills) ? payload.skills : []
        const totalRaw = payload?.total_count ?? payload?.total
        const total = Number(totalRaw)
        const safeTotal = Number.isFinite(total) ? total : 0

        const mapped: ListingRow[] = []
        for (const row of servicesData) {
          const r = row as {
            id: string
            freelancer_profile_id: string
            title: string | null
            description: string | null
            price: number | string | null
            delivery_days: number | string | null
            views_count?: number | string | null
            created_at: string | null
            is_vip?: boolean | null
            vip_expires_at?: string | null
            slug: string | null
            professional_title: string | null
            is_public: boolean | null
            bio: string | null
            availability: string | null
            average_rating: number | string | null
            completed_jobs_count: number | string | null
            full_name: string | null
            avatar_url: string | null
            city: string | null
            skills: unknown
            is_accepting_new_work?: boolean | null
          }
          if (!r.slug || r.is_public === false) continue
          const parsed = parseListingDescription(r.description ?? null)
          const skillsArr = Array.isArray(r.skills) ? r.skills : []
          const skillIds = skillsArr
            .map((x) => (x && typeof x === "object" && "id" in x ? String((x as { id?: unknown }).id ?? "") : ""))
            .filter((id): id is string => Boolean(id))
          const vipActive =
            r.is_vip === true &&
            Boolean(r.vip_expires_at) &&
            new Date(String(r.vip_expires_at)) > new Date()
          mapped.push({
            id: r.id,
            freelancerProfileId: String(r.freelancer_profile_id ?? ""),
            title: r.title ?? "სერვისი",
            descriptionRaw: r.description,
            price: Number(r.price ?? 0),
            deliveryDays: Number(r.delivery_days ?? 0),
            createdAt: r.created_at ?? new Date().toISOString(),
            freelancerSlug: r.slug,
            professionalTitle: r.professional_title ?? "",
            fullName: r.full_name?.trim() || "ფრილანსერი",
            avatarUrl: r.avatar_url ?? null,
            city: r.city ?? null,
            bio: r.bio ?? null,
            availability: r.availability ?? null,
            isAcceptingNewWork: r.is_accepting_new_work !== false,
            averageRating: Number(r.average_rating ?? 0),
            completedJobsCount: Number(r.completed_jobs_count ?? 0),
            viewsCount: Number(r.views_count ?? 0),
            skillIds,
            categoryId: parsed.meta.categoryId,
            subcategoryId: parsed.meta.subcategoryId,
            tags: parsed.meta.tags,
            vipActive,
          })
        }

        if (mapped.length > 0) {
          const fallbackByFp = Object.fromEntries(
            mapped.map((item) => [item.freelancerProfileId, item.completedJobsCount]),
          )
          const countMap = await getCachedCompletedWorkCounts(
            supabase,
            mapped.map((item) => item.freelancerProfileId),
            fallbackByFp,
          )
          for (const item of mapped) {
            item.completedJobsCount = countMap[item.freelancerProfileId] ?? item.completedJobsCount
          }
        }

        if (!append) {
          setListings(mapped)
          listingsNextOffsetRef.current = LISTINGS_PAGE_SIZE
          setListingsNextOffset(LISTINGS_PAGE_SIZE)
        } else {
          setListings((prev) => {
            const seen = new Set(prev.map((x) => x.id))
            const merged = [...prev]
            for (const item of mapped) {
              if (!seen.has(item.id)) {
                seen.add(item.id)
                merged.push(item)
              }
            }
            return merged
          })
          listingsNextOffsetRef.current += LISTINGS_PAGE_SIZE
          setListingsNextOffset(listingsNextOffsetRef.current)
        }

        setListingsTotal(safeTotal)

        setCategories(
          categoriesData.map((c) => {
            const row = c as { id?: string; name_ka?: string; parent_id?: string | null }
            return {
              id: String(row.id ?? ""),
              name_ka: String(row.name_ka ?? ""),
              parent_id: row.parent_id ?? null,
            }
          }),
        )
        if (!append) {
          const { data: subRows } = await supabase.from("subcategories").select("id,name_ka,category_id").eq("is_active", true)
          setSubcategoryNamesById(
            new Map(
              (subRows ?? []).map((r) => {
                const row = r as { id?: string; name_ka?: string }
                return [String(row.id ?? ""), String(row.name_ka ?? "")] as const
              }),
            ),
          )
          setSubcategoryParentById(
            new Map(
              (subRows ?? []).map((r) => {
                const row = r as { id?: string; category_id?: string | null }
                return [String(row.id ?? ""), String(row.category_id ?? "")] as const
              }),
            ),
          )
        }
        setSkills(
          skillsPayload.map((sk) => {
            const row = sk as { id?: string; name?: string; category_id?: string | null }
            return {
              id: String(row.id ?? ""),
              name: String(row.name ?? ""),
              category_id: row.category_id ?? null,
            }
          }),
        )
      } catch (e) {
        const message =
          e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message)
            : "მონაცემების ჩატვირთვა ვერ მოხერხდა."
        setError(message)
        if (!append) setListings([])
      } finally {
        setLoading(false)
        setListingsLoadingMore(false)
      }
    },
    [serverCategoryForFetch],
  )

  useEffect(() => {
    void fetchListingsPage(false)
  }, [serverCategoryForFetch, fetchListingsPage])

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
    setAdvancedDropdownOpen(true)
  }

  const saveAdvancedFilters = () => {
    setSelectedSkillIds([...draftSkillIds])
    setAvailabilityFilters([...draftAvailability])
    setMinimumRating(draftMinRating)
    setMinPrice(draftMinPrice)
    setMaxPrice(draftMaxPrice)
    setAdvancedDropdownOpen(false)
  }

  const clearDraftAdvanced = () => {
    setDraftSkillIds([])
    setDraftAvailability([])
    setDraftMinRating(0)
    setDraftMinPrice("")
    setDraftMaxPrice("")
  }

  const availabilityLabel: Record<Availability, string> = {
    full_time: "სრული განაკვეთი",
    part_time: "ნახევარი განაკვეთი",
    weekends: "შაბათ-კვირა",
  }
  const availabilityBadgeClass: Record<Availability, string> = {
    full_time: "bg-green-100 text-green-700",
    part_time: "bg-[#D4EEFF] text-[#006ACC]",
    weekends: "bg-orange-100 text-orange-700",
  }

  const toggleDraftAvailability = (value: Availability) => {
    setDraftAvailability((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]))
  }

  const toggleDraftSkill = (skillId: string) => {
    setDraftSkillIds((prev) => (prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]))
  }

  const clearFilters = () => {
    setSearchText("")
    setFilterRootCategoryId("")
    setFilterMidCategoryId("")
    setFilterSpecializationId("")
    setSelectedSkillIds([])
    setAvailabilityFilters([])
    setMinimumRating(0)
    setMinPrice("")
    setMaxPrice("")
    setLocationFilter("")
    clearDraftAdvanced()
    setAdvancedDropdownOpen(false)
    setSortBy("newest")
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

      if (
        catalogFilterEffectiveId &&
        !catalogSelectionMatchesEntity(
          categories as CategoryBranchRow[],
          catalogFilterEffectiveId,
          { categoryId: item.categoryId, subcategoryId: item.subcategoryId },
          subcategoryParentById,
        )
      ) {
        return false
      }

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
      const subQ =
        item.subcategoryId && subcategoryNamesById.has(item.subcategoryId)
          ? String(subcategoryNamesById.get(item.subcategoryId) ?? "").toLowerCase()
          : ""
      const catKa = item.categoryId
        ? (categories.find((c) => c.id === item.categoryId)?.name_ka ?? "").toLowerCase()
        : ""
      const hay = `${item.title} ${item.tags.join(" ")} ${item.professionalTitle} ${description} ${subQ} ${catKa}`
        .toLowerCase()
      return hay.includes(q)
    })

    list = [...list].sort((a, b) => {
      const vipOrder = (b.vipActive ? 1 : 0) - (a.vipActive ? 1 : 0)
      if (vipOrder !== 0) return vipOrder
      if (sortBy === "price_asc") return a.price - b.price
      if (sortBy === "price_desc") return b.price - a.price
      if (sortBy === "delivery") return a.deliveryDays - b.deliveryDays
      return +new Date(b.createdAt) - +new Date(a.createdAt)
    })
    return list
  }, [
    listings,
    searchText,
    catalogFilterEffectiveId,
    sortBy,
    selectedSkillIds,
    skillById,
    availabilityFilters,
    minimumRating,
    minPrice,
    maxPrice,
    locationFilter,
    subcategoryNamesById,
    subcategoryParentById,
    categories,
  ])

  const listingsHasMore = listingsNextOffset < listingsTotal

  const openListingQueryId = searchParams.get("open")

  useEffect(() => {
    if (loading || !openListingQueryId) return
    const idx = filteredSorted.findIndex((x) => x.id === openListingQueryId)
    const openId = openListingQueryId

    if (idx >= 0) {
      const t = window.setTimeout(() => {
        setPendingScrollToListingId(openId)
      }, 0)
      return () => window.clearTimeout(t)
    }

    if (listingsHasMore && !listingsLoadingMore) {
      void fetchListingsPage(true)
      return
    }

    const t = window.setTimeout(() => {
      setSearchParams(
        (p) => {
          p.delete("open")
          return p
        },
        { replace: true },
      )
    }, 0)
    return () => window.clearTimeout(t)
  }, [
    loading,
    openListingQueryId,
    filteredSorted,
    listingsHasMore,
    listingsLoadingMore,
    fetchListingsPage,
    setSearchParams,
  ])

  useEffect(() => {
    if (!pendingScrollToListingId) return
    if (!filteredSorted.some((v) => v.id === pendingScrollToListingId)) return

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
  }, [pendingScrollToListingId, filteredSorted, setSearchParams])

  return (
    <div className="min-h-screen bg-white page-enter">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-6 py-6 font-sans text-slate-600 md:px-8 md:py-8">
        <section className="p-1 md:p-0">
          <div className="mt-5 p-1">
            <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="h-10 w-[13.5rem] shrink-0">
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  className="h-10 w-full rounded-full border border-slate-300 bg-white px-2.5 text-sm text-slate-500 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-[#0088FF] focus:ring-2 focus:ring-inset focus:ring-[#0088FF]"
                  placeholder="ძიება"
                />
              </div>

              <label className="relative inline-flex h-10 min-w-[7.25rem] max-w-[9.5rem] shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white px-2 text-xs font-medium text-slate-500 sm:min-w-[7.75rem] sm:px-2.5 sm:text-sm">
                <span className="pointer-events-none min-w-0 flex-1 truncate">კატეგორია</span>
                <span className="shrink-0 text-slate-400">▾</span>
                <select
                  value={filterRootCategoryId}
                  onChange={(event) => {
                    const v = event.target.value
                    setFilterRootCategoryId(v)
                    setFilterMidCategoryId("")
                    setFilterSpecializationId("")
                  }}
                  className="absolute inset-0 z-10 h-full w-full min-h-[2.5rem] min-w-0 cursor-pointer opacity-0"
                  aria-label="კატეგორია"
                >
                  <option value="">ყველა</option>
                  {categoryRootsList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_ka}
                    </option>
                  ))}
                </select>
              </label>

              <label className="relative inline-flex h-10 min-w-[7.25rem] max-w-[9.5rem] shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white px-2 text-xs font-medium text-slate-500 sm:min-w-[7.75rem] sm:px-2.5 sm:text-sm">
                <span className="pointer-events-none min-w-0 flex-1 truncate">ქვეკატეგორია</span>
                <span className="shrink-0 text-slate-400">▾</span>
                <select
                  value={filterMidCategoryId}
                  disabled={!filterRootCategoryId || categoryMidsList.length === 0}
                  onChange={(event) => {
                    setFilterMidCategoryId(event.target.value)
                    setFilterSpecializationId("")
                  }}
                  className="absolute inset-0 z-10 h-full w-full min-h-[2.5rem] min-w-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  aria-label="ქვეკატეგორია"
                >
                  <option value="">
                    {!filterRootCategoryId
                      ? "ჯერ კატეგორია"
                      : categoryMidsList.length === 0
                        ? "არ არის"
                        : "ყველა (ამ დონეზე)"}
                  </option>
                  {categoryMidsList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_ka}
                    </option>
                  ))}
                </select>
              </label>

              <label className="relative inline-flex h-10 min-w-[7.25rem] max-w-[10rem] shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white px-2 text-xs font-medium text-slate-500 sm:min-w-[8rem] sm:px-2.5 sm:text-sm">
                <span className="pointer-events-none min-w-0 flex-1 truncate">სპეციალიზაცია</span>
                <span className="shrink-0 text-slate-400">▾</span>
                <select
                  value={filterSpecializationId}
                  disabled={!specializationParentCategoryId || specializationOptions.length === 0}
                  onChange={(event) => setFilterSpecializationId(event.target.value)}
                  className="absolute inset-0 z-10 h-full w-full min-h-[2.5rem] min-w-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  aria-label="სპეციალიზაცია"
                >
                  <option value="">
                    {!specializationParentCategoryId
                      ? "ჯერ ზემოთ"
                      : specializationOptions.length === 0
                        ? "არ არის"
                        : "ყველა (არასავალდებულო)"}
                  </option>
                  {specializationOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name_ka}
                    </option>
                  ))}
                </select>
              </label>

              <label className="relative inline-flex h-10 min-w-[6.5rem] max-w-[11rem] shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white px-2 text-xs font-medium text-slate-500 sm:px-2.5 sm:text-sm">
                <span className="pointer-events-none min-w-0 flex-1 truncate">
                  {locationFilter.trim() ? formatCityForDisplay(locationFilter) ?? locationFilter : "ლოკაცია"}
                </span>
                <span className="shrink-0 text-slate-400">▾</span>
                <LocationFilterSelect
                  value={locationFilter}
                  onChange={setLocationFilter}
                  className="absolute inset-0 z-10 h-full w-full min-h-[2.5rem] min-w-0 cursor-pointer opacity-0"
                />
              </label>

              <div className="relative" ref={advancedDropdownRef}>
                <button
                  type="button"
                  aria-expanded={advancedDropdownOpen}
                  aria-haspopup="dialog"
                  onClick={() => (advancedDropdownOpen ? setAdvancedDropdownOpen(false) : openAdvancedDropdown())}
                  className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white px-2 text-xs font-medium text-slate-500 transition hover:border-slate-400 sm:px-2.5 sm:text-sm"
                >
                  <span aria-hidden></span>
                  <span className="whitespace-nowrap">დეტალური ძებნა</span>
                  <span className="text-slate-400">▾</span>
                  {advancedFilterCount > 0 ? (
                    <span className="ml-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#0088FF] px-1 text-xs font-bold text-white">
                      {advancedFilterCount}
                    </span>
                  ) : null}
                </button>

                {advancedDropdownOpen ? (
                  <>
                    <div className="fixed inset-0 z-40 bg-black/20 md:hidden" aria-hidden onClick={() => setAdvancedDropdownOpen(false)} />
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-label="დეტალური ფილტრები"
                      className="absolute right-0 z-50 mt-2 flex max-h-[min(72vh,560px)] w-[min(100vw-2rem,24rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
                    >
                      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
                        <h2 className="border-l-4 border-[#0088FF] pl-3 text-base font-bold text-[#1B2B4B]">დეტალური ფილტრები</h2>
                        <div className="mt-4 space-y-4">
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
                              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#0088FF] focus:ring-2"
                            >
                              <option value={0}>ნებისმიერი</option>
                              <option value={3}>3+ ვარსკვლავი</option>
                              <option value={4}>4+ ვარსკვლავი</option>
                              <option value={5}>5 ვარსკვლავი</option>
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
                                className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#0088FF] focus:ring-2"
                              />
                              <input
                                type="number"
                                min={0}
                                value={draftMaxPrice}
                                onChange={(event) => setDraftMaxPrice(event.target.value)}
                                placeholder="მაქს"
                                className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#0088FF] focus:ring-2"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 space-y-2 border-t border-slate-100 bg-white p-3">
                        <button
                          type="button"
                          onClick={clearDraftAdvanced}
                          className="h-11 w-full rounded-lg border border-[#0088FF] text-sm font-semibold text-[#1B2B4B] hover:bg-[#E8F4FF]"
                        >
                          ფილტრების გასუფთავება
                        </button>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setAdvancedDropdownOpen(false)}
                            className="h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold text-[#1B2B4B] hover:bg-slate-50"
                          >
                            გაუქმება
                          </button>
                          <button
                            type="button"
                            onClick={saveAdvancedFilters}
                            className="h-11 flex-1 rounded-lg bg-[#0088FF] text-sm font-semibold text-white hover:bg-[#006ACC]"
                          >
                            შენახვა
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              <label className="relative inline-flex h-10 min-w-[6.5rem] shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white px-2 text-xs font-medium text-slate-500 sm:px-2.5 sm:text-sm">
                <span aria-hidden></span>
                <span className="truncate">სორტირება</span>
                <span className="ml-auto shrink-0 text-slate-400">▾</span>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortOption)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="სორტირება"
                >
                  <option value="newest">უახლესი</option>
                  <option value="price_asc">ფასი: იაფიდან</option>
                  <option value="price_desc">ფასი: ძვირიდან</option>
                  <option value="delivery">მოკლე მიწოდება</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => setAdvancedDropdownOpen(false)}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#0088FF] px-4 text-sm font-bold text-white transition hover:bg-[#006ACC] sm:px-5 sm:text-base"
              >
                ძიება
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 min-w-0">
          {error ? (
            <ErrorState message={error} onRetry={() => void fetchListingsPage(false)} />
          ) : loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonCard key={`skeleton-${index}`} avatar lines={4} />
              ))}
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-600">მოიძებნა {filteredSorted.length} განცხადება</p>
              </div>

              {filteredSorted.length === 0 ? (
                <EmptyState
                  message="ახლა საჯარო აქტიური სერვისები არ ჩანს. სცადეთ განსხვავებული ძიება ან მოგვიანებით."
                  actionLabel="ფილტრების გასუფთავება"
                  onAction={clearFilters}
                />
              ) : (
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredSorted.map((item) => {
                    const { description } = parseListingDescription(item.descriptionRaw)
                    const negotiable = isNegotiable(item.price, description)
                    const availKey = item.availability as Availability | null
                    const hasAvailBadge =
                      availKey !== null &&
                      (availKey === "full_time" || availKey === "part_time" || availKey === "weekends")
                    const availabilityText =
                      hasAvailBadge && availKey ? availabilityLabel[availKey] : null
                    return (
                      <li
                        id={`listing-card-${item.id}`}
                        key={item.id}
                        role="link"
                        tabIndex={0}
                        className={`relative flex h-full cursor-pointer flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#0088FF] ${
                          flashListingId === item.id ? "ring-2 ring-[#0088FF] ring-offset-2 ring-offset-white" : ""
                        }`}
                        onClick={() => navigate(`/listing/${encodeURIComponent(item.id)}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            navigate(`/listing/${encodeURIComponent(item.id)}`)
                          }
                        }}
                      >
                        <FreelancerAvailabilityIndicator
                          available={item.isAcceptingNewWork}
                          labelWhenAvailable="ფრილანსერი ახალი სამუშაოებისთვის ხელმისაწვდომია."
                          labelWhenUnavailable="ეს ფრილანსერი ამჟამად ახალი სამუშაოებისთვის ხელმიუწვდომელია. შეთავაზების გაგზავნა მაინც შეგიძლიათ."
                        />
                        <div className="shrink-0">
                          <div className="flex items-start gap-3">
                            <Link
                              to={`/freelancer/${item.freelancerSlug}`}
                              className="shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.avatarUrl ? (
                                <img
                                  src={avatarImageUrl(supabase, item.avatarUrl) ?? item.avatarUrl}
                                  alt=""
                                  loading="lazy"
                                  className="h-16 w-16 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1B2B4B] text-lg font-bold text-white">
                                  {getInitials(item.fullName)}
                                </div>
                              )}
                            </Link>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  to={`/freelancer/${item.freelancerSlug}`}
                                  className="truncate text-lg font-bold text-gray-900 hover:text-[#0088FF]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {item.fullName}
                                </Link>
                                {item.vipActive ? (
                                  <span className="rounded-full bg-[#E8F4FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0088FF]">
                                    VIP
                                  </span>
                                ) : null}
                              </div>
                              <p className="truncate text-sm text-slate-500">{item.professionalTitle || "ფრილანსერი"}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                📍 {formatCityForDisplay(item.city) ?? item.city ?? "ქალაქი უცნობია"}
                              </p>
                            </div>
                          </div>

                          <p className="mt-2 line-clamp-2 text-sm font-semibold text-gray-900">
                            {item.title}
                          </p>

                          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">
                            {description.trim() || "დეტალური აღწერა გიგორში."}
                          </p>

                          <div className="mt-3 flex items-center justify-between text-sm">
                            <p className="font-semibold">
                              <span className="text-amber-500">{ratingStars(item.averageRating)}</span>
                              <span className="text-gray-900"> {item.averageRating.toFixed(1)}</span>
                            </p>
                          </div>
                        </div>

                        {/* Fills vertical space: tag chips or blank white area */}
                        <div className="mt-3 flex min-h-0 flex-1 flex-col">
                          {item.tags.length > 0 || (item.subcategoryId && subcategoryNamesById.get(item.subcategoryId)) ? (
                            <div className="flex flex-wrap gap-2">
                              {item.subcategoryId && subcategoryNamesById.get(item.subcategoryId) ? (
                                <span className="rounded-full border border-[#0088FF]/35 bg-[#E8F4FF] px-2 py-1 text-xs font-semibold text-[#0088FF]">
                                  {subcategoryNamesById.get(item.subcategoryId)}
                                </span>
                              ) : null}
                              {item.tags.slice(0, 4).map((tag) => (
                                <span key={tag} className="rounded-full border border-slate-300 px-2 py-1 text-xs font-medium text-gray-900">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="min-h-0 flex-1" aria-hidden />
                        </div>

                        <div className="mt-3 shrink-0 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900">
                              {negotiable ? "შეთანხმებით" : `₾${item.price.toLocaleString("ka-GE")} დან`}
                            </p>
                            {hasAvailBadge && availabilityText ? (
                              <span
                                className={`shrink-0 rounded-full px-2 py-1 text-xs ${availabilityBadgeClass[availKey as Availability]}`}
                              >
                                {availabilityText}
                              </span>
                            ) : (
                              <span className="text-right text-xs text-slate-500">
                                {item.deliveryDays} სამუშაო დღე
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            💼 {item.completedJobsCount} შესრულებული ·{" "}
                            <span className="inline-flex items-center gap-0.5 align-middle">
                              <ViewCountEyeIcon className="relative -top-px inline h-3.5 w-3.5 text-slate-500" />
                              {item.viewsCount} ნახვა
                            </span>
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-nowrap gap-2 pt-3">
                          {viewerType === "hirer" && viewerFreelancerProfileId !== item.freelancerProfileId ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openListingInquiry(item)
                                }}
                                className="inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg border border-[#0088FF] bg-white px-2 text-sm font-semibold text-[#0088FF] transition hover:bg-[#E8F4FF]"
                              >
                                შეთავაზება
                              </button>
                              <SaveBookmarkButton
                                variant="icon"
                                resourceType="freelancer"
                                resourceId={item.freelancerProfileId}
                              />
                              <Link
                                to={`/freelancer/${item.freelancerSlug}`}
                                className="inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg bg-[#0088FF] px-2 text-sm font-semibold text-white transition hover:bg-[#006ACC]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                პროფილის ნახვა
                              </Link>
                            </>
                          ) : (
                            <>
                              {viewerFreelancerProfileId !== item.freelancerProfileId ? (
                                <SaveBookmarkButton
                                  variant="icon"
                                  resourceType="freelancer"
                                  resourceId={item.freelancerProfileId}
                                />
                              ) : null}
                              <Link
                                to={`/freelancer/${item.freelancerSlug}`}
                                className="inline-flex h-11 w-full min-w-0 flex-1 items-center justify-center rounded-lg bg-[#0088FF] px-4 text-sm font-semibold text-white transition hover:bg-[#006ACC]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                პროფილის ნახვა
                              </Link>
                            </>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}

              {!error && listingsHasMore && filteredSorted.length > 0 ? (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    disabled={listingsLoadingMore}
                    onClick={() => void fetchListingsPage(true)}
                    className="h-11 rounded-lg border border-[#0088FF] px-6 text-sm font-semibold text-[#0088FF] hover:bg-[#E8F4FF] disabled:opacity-60"
                  >
                    {listingsLoadingMore ? "იტვირთება…" : "მეტის ნახვა"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>

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
                ტექსტი გამოჩნდება ფრილანსერის მართვის პანელზე „შეთავაზებები ლისტინგებზე“. სამუშაოს დასრულება იქვე ფიქსირდება (სტატუსი „დასრულებული“) — განცხადების გარეშე.
              </p>
              <label className="mt-4 block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">შეტყობინება</span>
                <textarea
                  value={inquiryMessage}
                  onChange={(e) => setInquiryMessage(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#0088FF] focus:ring-2"
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
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#0088FF] focus:ring-2"
                  placeholder="მაგ. 500"
                />
              </label>
              {inquiryFormError ? <p className="mt-2 text-sm text-red-600">{inquiryFormError}</p> : null}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={inquirySubmitting}
                  onClick={() => void submitListingInquiry()}
                  className="flex-1 rounded-lg bg-[#0088FF] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#006ACC] disabled:opacity-60"
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
