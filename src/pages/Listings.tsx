import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { OptimizedImage } from "../components/OptimizedImage.tsx"
import EmptyState from "../components/ui/EmptyState.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import FreelancerAvailabilityIndicator from "../components/FreelancerAvailabilityIndicator.tsx"
import MarketplaceCatalogToolbar, { marketplaceFilterPillClass } from "../components/MarketplaceCatalogToolbar.tsx"
import SaveBookmarkButton from "../components/SaveBookmarkButton.tsx"
import LocationFilterSelect from "../components/LocationFilterSelect.tsx"
import { useToast } from "../components/ui/ToastProvider.tsx"
import { META_SUFFIX, resolveListingMetaPrefix, stripLegacyPricePrefix } from "../lib/listingDescription.ts"
import { formatListingPrice } from "../lib/listingPrice.ts"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { fetchAllRowsByRange } from "../lib/supabaseFetchPaged.ts"
import { fetchListingsPagePayload } from "../lib/marketplaceEdge.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { isSupabaseConfigured, supabase, formatSupabaseClientError } from "../lib/supabase"
import { usePageMeta } from "../lib/usePageMeta.tsx"
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
import VipBadge from "../components/VipBadge.tsx"
import { normalizeSearchInput, validateInquiryMessage, validateMoneyAmount } from "../lib/validation.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { assertContentRateLimit, formatContentRateLimitError } from "../lib/contentRateLimit.ts"
import { localizedNameFromMap, pickCategoryName, type LocalizedNameEntry } from "../lib/categoryLocale.ts"
import { pickListingDescription, pickListingTitle } from "../lib/listingLocale.ts"
import { useSearchImpressions } from "../lib/searchImpressions.ts"
type ListingMeta = { categoryId: string | null; subcategoryId: string | null; tags: string[] }
type Availability = "full_time" | "part_time" | "weekends"
type SkillItem = { id: string; name: string; category_id: string | null }

function parseListingDescription(raw: string | null): { description: string; meta: ListingMeta } {
  const fallback: ListingMeta = { categoryId: null, subcategoryId: null, tags: [] }
  if (!raw) return { description: "", meta: fallback }
  const metaPrefix = resolveListingMetaPrefix(raw)
  if (!metaPrefix) return { description: stripLegacyPricePrefix(raw), meta: fallback }
  const endIndex = raw.indexOf(META_SUFFIX)
  if (endIndex < 0) return { description: stripLegacyPricePrefix(raw), meta: fallback }
  const metaChunk = raw.slice(metaPrefix.length, endIndex).trim()
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

type SortOption = "newest" | "price_asc" | "price_desc"

type ListingRow = {
  id: string
  freelancerProfileId: string
  title: string
  titleEn: string | null
  descriptionRaw: string | null
  descriptionEn: string | null
  price: number
  priceType: string
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

type CategoryItem = { id: string; name_ka: string; name_en?: string | null; parent_id: string | null }

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
    titleEn: null,
    descriptionRaw:
      '<!--hira-meta:{"categoryId":null,"subcategoryId":null,"tags":["React","TypeScript"]}-->ლეიაუტის აწყობა, ფორმების დაკავშირება API-თან.',
    descriptionEn: null,
    price: 450,
    priceType: "fixed",
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
    titleEn: null,
    descriptionRaw: "ვახდენთ ინტერფეისის აუდიტს და იუზაბილითის რეკომენდაციებს.",
    descriptionEn: null,
    price: 280,
    priceType: "fixed",
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

type ListingsCatalogPage = {
  listings: ListingRow[]
  categories: CategoryItem[]
  skills: SkillItem[]
  subcategoryNamesById: Map<string, LocalizedNameEntry>
  subcategoryParentById: Map<string, string>
  total: number
}

async function loadListingsCatalogPage(
  page: number,
  searchQuery: string | null = null,
): Promise<ListingsCatalogPage> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      listings: mockListings,
      categories: [],
      skills: [],
      subcategoryNamesById: new Map(),
      subcategoryParentById: new Map(),
      total: mockListings.length,
    }
  }

  const client = supabase
  const payload = (await fetchListingsPagePayload(page, searchQuery)) as null | {
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
      title_en?: string | null
      description: string | null
      description_en?: string | null
      price: number | string | null
      price_type: string | null
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
      r.is_vip === true && Boolean(r.vip_expires_at) && new Date(String(r.vip_expires_at)) > new Date()
    mapped.push({
      id: r.id,
      freelancerProfileId: String(r.freelancer_profile_id ?? ""),
      title: r.title ?? "სერვისი",
      titleEn: r.title_en?.trim() || null,
      descriptionRaw: r.description,
      descriptionEn: r.description_en?.trim() || null,
      price: Number(r.price ?? 0),
      priceType: String(r.price_type ?? "fixed"),
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
    const fallbackByFp = Object.fromEntries(mapped.map((item) => [item.freelancerProfileId, item.completedJobsCount]))
    const countMap = await getCachedCompletedWorkCounts(
      supabase,
      mapped.map((item) => item.freelancerProfileId),
      fallbackByFp,
    )
    for (const item of mapped) {
      item.completedJobsCount = countMap[item.freelancerProfileId] ?? item.completedJobsCount
    }
  }

  const categories = categoriesData.map((c) => {
    const row = c as { id?: string; name_ka?: string; name_en?: string | null; parent_id?: string | null }
    return {
      id: String(row.id ?? ""),
      name_ka: String(row.name_ka ?? ""),
      name_en: row.name_en ?? null,
      parent_id: row.parent_id ?? null,
    }
  })

  const skills = skillsPayload.map((sk) => {
    const row = sk as { id?: string; name?: string; category_id?: string | null }
    return {
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      category_id: row.category_id ?? null,
    }
  })

  let subcategoryNamesById = new Map<string, LocalizedNameEntry>()
  let subcategoryParentById = new Map<string, string>()
  if (page === 1) {
    try {
      const subRows = await fetchAllRowsByRange(
        (from, to) =>
          client
            .from("subcategories")
            .select("id,name_ka,name_en,category_id")
            .eq("is_active", true)
            .order("name_ka")
            .range(from, to),
        500,
        client,
      )
      subcategoryNamesById = new Map(
        subRows.map((r) => {
          const row = r as { id?: string; name_ka?: string; name_en?: string | null }
          return [
            String(row.id ?? ""),
            { name_ka: String(row.name_ka ?? ""), name_en: String(row.name_en ?? "") },
          ] as const
        }),
      )
      subcategoryParentById = new Map(
        subRows.map((r) => {
          const row = r as { id?: string; category_id?: string | null }
          return [String(row.id ?? ""), String(row.category_id ?? "")] as const
        }),
      )
    } catch (subcategoryError) {
      console.warn("[listings] subcategory filters unavailable:", subcategoryError)
    }
  }

  return {
    listings: mapped,
    categories,
    skills,
    subcategoryNamesById,
    subcategoryParentById,
    total: safeTotal,
  }
}

export default function ListingsPage() {
  const { t, locale } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { pushToast } = useToast()
  const [searchText, setSearchText] = useState("")
  const deferredSearchText = useDeferredValue(searchText)
  const serverSearchQuery = deferredSearchText.trim()
  const [filterRootCategoryId, setFilterRootCategoryId] = useState("")
  const [filterMidCategoryId, setFilterMidCategoryId] = useState("")
  const [filterSpecializationId, setFilterSpecializationId] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("newest")

  const {
    data: catalogData,
    isLoading: loading,
    isError,
    error: catalogError,
    fetchNextPage,
    hasNextPage: listingsHasMore,
    isFetchingNextPage: listingsLoadingMore,
    refetch,
  } = useInfiniteQuery({
    queryKey: queryKeys.listingsCatalog(serverSearchQuery),
    queryFn: ({ pageParam }) => loadListingsCatalogPage(pageParam, serverSearchQuery || null),
    initialPageParam: 1,
    staleTime: 30_000,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const loadedOffset = lastPageParam * LISTINGS_PAGE_SIZE
      if (loadedOffset < lastPage.total) return lastPageParam + 1
      return undefined
    },
  })

  const error = isError
    ? queryErrorMessage(catalogError, formatSupabaseClientError(catalogError, "მონაცემების ჩატვირთვა ვერ მოხერხდა."))
    : ""

  const firstPage = catalogData?.pages[0]
  const categories = firstPage?.categories ?? []
  const skills = firstPage?.skills ?? []
  const subcategoryNamesById = firstPage?.subcategoryNamesById ?? new Map<string, LocalizedNameEntry>()
  const subcategoryParentById = firstPage?.subcategoryParentById ?? new Map<string, string>()

  const listings = useMemo(() => {
    const seen = new Set<string>()
    const merged: ListingRow[] = []
    for (const page of catalogData?.pages ?? []) {
      for (const item of page.listings) {
        if (!seen.has(item.id)) {
          seen.add(item.id)
          merged.push(item)
        }
      }
    }
    return merged
  }, [catalogData?.pages])

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
    const out: { id: string; name_ka: string; name_en: string }[] = []
    for (const [subId, catId] of subcategoryParentById) {
      if (catId === parent) {
        const entry = subcategoryNamesById.get(subId)
        const nameKa = (entry?.name_ka ?? "").trim()
        const nameEn = (entry?.name_en ?? "").trim()
        if (subId && (nameKa || nameEn)) {
          out.push({ id: subId, name_ka: nameKa || nameEn, name_en: nameEn })
        }
      }
    }
    return out.sort((a, b) => a.name_ka.localeCompare(b.name_ka, "ka"))
  }, [specializationParentCategoryId, subcategoryParentById, subcategoryNamesById])

  const catalogFilterEffectiveId = useMemo(
    () => effectiveCatalogFilterId(filterRootCategoryId, filterMidCategoryId, filterSpecializationId),
    [filterRootCategoryId, filterMidCategoryId, filterSpecializationId],
  )

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
    const msgResult = validateInquiryMessage(inquiryMessage)
    if (msgResult.ok === false) {
      setInquiryFormError(msgResult.message)
      return
    }
    const msg = msgResult.value
    let proposed: number | null = null
    const rawB = inquiryBudget.trim()
    if (rawB) {
      const budgetResult = validateMoneyAmount(rawB, { min: 0, label: "შემოთავაზებული თანხა" })
      if (budgetResult.ok === false) {
        setInquiryFormError(budgetResult.message)
        return
      }
      if (budgetResult.value == null) {
        setInquiryFormError("შემოთავაზებული თანხა არასწორია.")
        return
      }
      proposed = budgetResult.value
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
      await assertContentRateLimit("service-inquiry")
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
      const rateMsg = formatContentRateLimitError(e, t)
      const m =
        rateMsg ??
        (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "გაგზავნა ვერ მოხერხდა.")
      setInquiryFormError(m)
    } finally {
      setInquirySubmitting(false)
    }
  }
  useEffect(() => {
    const query = searchParams.get("q")
    if (query) setSearchText(normalizeSearchInput(query))
  }, [searchParams])

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

  const availabilityLabel: Record<Availability, string> = useMemo(
    () => ({
      full_time: t("common.availabilityFullTime"),
      part_time: t("common.availabilityPartTime"),
      weekends: t("common.availabilityWeekends"),
    }),
    [t],
  )
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

      return true
    })

    list = [...list].sort((a, b) => {
      // Preserve server VIP + FTS rank + recency when searching with default sort.
      if (serverSearchQuery && sortBy === "newest") return 0
      const vipOrder = (b.vipActive ? 1 : 0) - (a.vipActive ? 1 : 0)
      if (vipOrder !== 0) return vipOrder
      if (sortBy === "price_asc") return a.price - b.price
      if (sortBy === "price_desc") return b.price - a.price
      return +new Date(b.createdAt) - +new Date(a.createdAt)
    })
    return list
  }, [
    listings,
    catalogFilterEffectiveId,
    sortBy,
    selectedSkillIds,
    skillById,
    availabilityFilters,
    minimumRating,
    minPrice,
    maxPrice,
    locationFilter,
    subcategoryParentById,
    categories,
    serverSearchQuery,
  ])
  useSearchImpressions(useMemo(() => filteredSorted.map((item) => item.freelancerProfileId), [filteredSorted]))

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
      void fetchNextPage()
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
    fetchNextPage,
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

  const listingsCategoryFilterSlot = (
    <div className="grid w-full grid-cols-3 gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-2">
      <label className={`${marketplaceFilterPillClass} min-w-0`}>
        <span className="pointer-events-none min-w-0 flex-1 truncate">{t("common.category")}</span>
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
          aria-label={t("common.category")}
        >
          <option value="">{t("common.all")}</option>
          {categoryRootsList.map((c) => (
            <option key={c.id} value={c.id}>
              {pickCategoryName(c, locale)}
            </option>
          ))}
        </select>
      </label>

      <label className={`${marketplaceFilterPillClass} min-w-0`}>
        <span className="pointer-events-none min-w-0 flex-1 truncate">{t("common.subcategory")}</span>
        <span className="shrink-0 text-slate-400">▾</span>
        <select
          value={filterMidCategoryId}
          disabled={!filterRootCategoryId || categoryMidsList.length === 0}
          onChange={(event) => {
            setFilterMidCategoryId(event.target.value)
            setFilterSpecializationId("")
          }}
          className="absolute inset-0 z-10 h-full w-full min-h-[2.5rem] min-w-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          aria-label={t("common.subcategory")}
        >
          <option value="">
            {!filterRootCategoryId
              ? t("common.categoryFirst")
              : categoryMidsList.length === 0
                ? t("common.none")
                : t("common.allAtLevel")}
          </option>
          {categoryMidsList.map((c) => (
            <option key={c.id} value={c.id}>
              {pickCategoryName(c, locale)}
            </option>
          ))}
        </select>
      </label>

      <label className={`${marketplaceFilterPillClass} min-w-0`}>
        <span className="pointer-events-none min-w-0 flex-1 truncate">{t("common.specialization")}</span>
        <span className="shrink-0 text-slate-400">▾</span>
        <select
          value={filterSpecializationId}
          disabled={!specializationParentCategoryId || specializationOptions.length === 0}
          onChange={(event) => setFilterSpecializationId(event.target.value)}
          className="absolute inset-0 z-10 h-full w-full min-h-[2.5rem] min-w-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          aria-label={t("common.specialization")}
        >
          <option value="">
            {!specializationParentCategoryId
              ? t("common.selectAbove")
              : specializationOptions.length === 0
                ? t("common.none")
                : t("common.allOptional")}
          </option>
          {specializationOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {pickCategoryName(s, locale)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )

  const listingsLocationSlot = (
    <label className={`${marketplaceFilterPillClass} min-w-0 max-w-[8.5rem] flex-1 sm:max-w-[11rem] sm:flex-none`}>
      <span className="pointer-events-none min-w-0 flex-1 truncate">
        {locationFilter.trim() ? formatCityForDisplay(locationFilter) ?? locationFilter : t("common.location")}
      </span>
      <span className="shrink-0 text-slate-400">▾</span>
      <LocationFilterSelect
        value={locationFilter}
        onChange={setLocationFilter}
        className="absolute inset-0 z-10 h-full w-full min-h-[2.5rem] min-w-0 cursor-pointer opacity-0"
      />
    </label>
  )

  const listingsAdvancedBody = (
    <>
      <div>
        <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">{t("common.skills")}</p>
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
        <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">{t("browse.availability")}</p>
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
        <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("listings.minFreelancerRating")}</span>
        <select
          value={draftMinRating}
          onChange={(event) => setDraftMinRating(Number(event.target.value) as 0 | 3 | 4 | 5)}
          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
        >
          <option value={0}>{t("common.anyLocation")}</option>
          <option value={3}>3+</option>
          <option value={4}>4+</option>
          <option value={5}>5</option>
        </select>
      </label>

      <div>
        <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">{t("listings.listingPriceRange")}</p>
        <p className="mb-2 text-xs text-slate-500">{t("listings.negotiablePriceHint")}</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            min={0}
            value={draftMinPrice}
            onChange={(event) => setDraftMinPrice(event.target.value)}
            placeholder={t("common.min")}
            className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
          />
          <input
            type="number"
            min={0}
            value={draftMaxPrice}
            onChange={(event) => setDraftMaxPrice(event.target.value)}
            placeholder={t("common.max")}
            className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
          />
        </div>
      </div>
    </>
  )

  return (

    <>
    {usePageMeta(t("listings.title"), t("listings.metaDescription"))}

    <div className="min-h-screen bg-white page-enter">
      <main className="mx-auto w-full max-w-7xl px-6 py-6 font-sans text-slate-600 md:px-8 md:py-8">
        <section className="p-1 md:p-0">
          <MarketplaceCatalogToolbar
            eyebrow=""
            title=""
            showPageHeader={false}
            searchValue={searchText}
            onSearchChange={(value) => setSearchText(normalizeSearchInput(value))}
            searchPlaceholder={t("common.search")}
            categorySlot={listingsCategoryFilterSlot}
            locationSlot={listingsLocationSlot}
            advancedSearchLabel={t("listings.detailedSearch")}
            sortValue={sortBy}
            onSortChange={(value) => setSortBy(value as SortOption)}
            sortOptions={[
              { value: "newest", label: t("common.newest") },
              { value: "price_asc", label: t("common.priceAsc") },
              { value: "price_desc", label: t("common.priceDesc") },
            ]}
            advancedDropdownOpen={advancedDropdownOpen}
            advancedFilterCount={advancedFilterCount}
            onToggleAdvanced={openAdvancedDropdown}
            advancedDropdownRef={advancedDropdownRef}
            onDismissAdvanced={() => setAdvancedDropdownOpen(false)}
            onSaveAdvanced={saveAdvancedFilters}
            onClearDraftAdvanced={clearDraftAdvanced}
            childrenAdvancedBody={listingsAdvancedBody}
          />
        </section>

        <section className="mt-6 min-w-0">
          {error ? (
            <ErrorState message={error} onRetry={() => void refetch()} />
          ) : loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonCard key={`skeleton-${index}`} avatar lines={4} />
              ))}
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-600">{t("listings.found", { count: filteredSorted.length })}</p>
              </div>

              {filteredSorted.length === 0 ? (
                <EmptyState
                  message={t("listings.empty")}
                  actionLabel={t("common.clearFilters")}
                  onAction={clearFilters}
                />
              ) : (
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredSorted.map((item) => {
                    const { description } = parseListingDescription(item.descriptionRaw)
                    const displayTitle = pickListingTitle(
                      { title: item.title, titleEn: item.titleEn },
                      locale,
                      t("listingDetail.defaultTitle"),
                    )
                    const displayDescription = pickListingDescription(
                      { description, descriptionEn: item.descriptionEn },
                      locale,
                    )
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
                        <div className="shrink-0">
                          <div className="flex items-start gap-3">
                            <Link
                              to={`/freelancer/${item.freelancerSlug}`}
                              className="shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <FreelancerAvailabilityIndicator
                                available={item.isAcceptingNewWork}
                                labelWhenAvailable={t("listings.freelancerAvailable")}
                                labelWhenUnavailable={t("listings.freelancerUnavailable")}
                              >
                                {item.avatarUrl ? (
                                  <OptimizedImage
                                    src={avatarImageUrl(supabase, item.avatarUrl) ?? item.avatarUrl}
                                    alt=""
                                    width={64}
                                    height={64}
                                    className="h-16 w-16 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1B2B4B] text-lg font-bold text-white">
                                    {getInitials(item.fullName)}
                                  </div>
                                )}
                              </FreelancerAvailabilityIndicator>
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
                                {item.vipActive ? <VipBadge /> : null}
                              </div>
                              <p className="truncate text-sm text-slate-500">{item.professionalTitle || t("common.freelancerFallback")}</p>
                              {formatCityForDisplay(item.city) ? (
                                <p className="mt-1 text-xs text-slate-500">📍 {formatCityForDisplay(item.city)}</p>
                              ) : null}
                            </div>
                          </div>

                          <p className="mt-2 line-clamp-2 text-sm font-semibold text-gray-900">
                            {displayTitle}
                          </p>

                          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">
                            {displayDescription.trim() || t("listings.defaultCardDescription")}
                          </p>

                          <div className="mt-3 flex items-center justify-between text-sm">
                            <p className="font-semibold text-gray-900">{item.averageRating.toFixed(1)}</p>
                          </div>
                        </div>

                        {/* Fills vertical space: tag chips or blank white area */}
                        <div className="mt-3 flex min-h-0 flex-1 flex-col">
                          {item.tags.length > 0 ||
                          (item.subcategoryId && localizedNameFromMap(subcategoryNamesById, item.subcategoryId, locale)) ? (
                            <div className="flex flex-wrap gap-2">
                              {item.subcategoryId && localizedNameFromMap(subcategoryNamesById, item.subcategoryId, locale) ? (
                                <span className="rounded-full border border-[#0088FF]/35 bg-[#E8F4FF] px-2 py-1 text-xs font-semibold text-[#0088FF]">
                                  {localizedNameFromMap(subcategoryNamesById, item.subcategoryId, locale)}
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
                              {formatListingPrice(item.price, item.priceType, { negotiable, locale })}
                            </p>
                            {hasAvailBadge && availabilityText ? (
                              <span
                                className={`shrink-0 rounded-full px-2 py-1 text-xs ${availabilityBadgeClass[availKey as Availability]}`}
                              >
                                {availabilityText}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500">
                            💼 {t("common.completed", { count: item.completedJobsCount })} ·{" "}
                            <span className="inline-flex items-center gap-0.5 align-middle">
                              <ViewCountEyeIcon className="relative -top-px inline h-3.5 w-3.5 text-slate-500" />
                              {item.viewsCount}
                            </span>
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-nowrap gap-2 pt-3">
                          {viewerType === "hirer" && viewerFreelancerProfileId !== item.freelancerProfileId ? (
                            <>
                              <SaveBookmarkButton
                                variant="icon"
                                resourceType="freelancer"
                                resourceId={item.freelancerProfileId}
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openListingInquiry(item)
                                }}
                                className="inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg border border-[#0088FF] bg-white px-2 text-sm font-semibold text-[#0088FF] transition hover:bg-[#E8F4FF]"
                              >
                                {t("listings.makeOffer")}
                              </button>
                              <Link
                                to={`/freelancer/${item.freelancerSlug}`}
                                className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-[#0088FF] px-2 text-sm font-semibold text-white transition hover:bg-[#006ACC]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {t("nav.viewProfile")}
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
                                className="inline-flex h-11 w-full min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-lg bg-[#0088FF] px-4 text-sm font-semibold text-white transition hover:bg-[#006ACC]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {t("nav.viewProfile")}
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
                    onClick={() => void fetchNextPage()}
                    className="h-11 rounded-lg border border-[#0088FF] px-6 text-sm font-semibold text-[#0088FF] hover:bg-[#E8F4FF] disabled:opacity-60"
                  >
                    {listingsLoadingMore ? t("common.loading") : t("common.loadMoreView")}
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
              <h3 className="text-lg font-bold text-[#1B2B4B]">{t("listings.offerToFreelancer")}</h3>
              <p className="mt-1 text-sm text-slate-600 line-clamp-2">{inquiryListing.title}</p>
              <p className="mt-2 text-xs text-slate-500">
                {t("listings.inquiryModalHint")}
              </p>
              <label className="mt-4 block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">{t("listings.inquiryMessage")}</span>
                <textarea
                  value={inquiryMessage}
                  onChange={(e) => setInquiryMessage(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#0088FF] focus:ring-2"
                  placeholder={t("listings.messagePlaceholder")}
                />
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">{t("listings.proposedAmountOptional")}</span>
                <input
                  type="number"
                  min={0}
                  value={inquiryBudget}
                  onChange={(e) => setInquiryBudget(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#0088FF] focus:ring-2"
                  placeholder={t("listings.exampleAmount")}
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
                  {inquirySubmitting ? t("common.sending") : t("common.send")}
                </button>
                <button
                  type="button"
                  disabled={inquirySubmitting}
                  onClick={() => setInquiryListing(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  </>
  )
}
