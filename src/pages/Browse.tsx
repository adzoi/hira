import { useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { Link, useSearchParams } from "react-router-dom"
import EmptyState from "../components/ui/EmptyState.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import { mergeFreelancerCompletedWorkCounts } from "../lib/freelancerCompletedWorkCounts.ts"
import { stripLegacyPricePrefix } from "../lib/listingDescription.ts"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { fetchAllRowsByRange } from "../lib/supabaseFetchPaged.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { matchesLocationFilter } from "../lib/marketplaceFilters.ts"
import {
  catalogSelectionMatchesEntity,
  categoryChildrenOf,
  categoryRoots,
  effectiveCatalogFilterId,
  rootIdContainingCategory,
  type CategoryBranchRow,
} from "../lib/marketplaceCategoryTree.ts"
import FreelancerAvailabilityIndicator from "../components/FreelancerAvailabilityIndicator.tsx"
import SaveBookmarkButton from "../components/SaveBookmarkButton.tsx"
import LocationFilterSelect from "../components/LocationFilterSelect.tsx"
import { LIMITS, normalizeSearchInput, sanitizeDisplayText } from "../lib/validation.ts"

type SortOption = "rating" | "price_asc" | "price_desc" | "newest" | "completed"
type Availability = "full_time" | "part_time" | "weekends"

type FreelancerCardItem = {
  id: string
  slug: string
  professionalTitle: string
  averageRating: number
  totalReviewsCount: number
  availability: string | null
  /** false = temporarily not taking new work (shown on card; inquiries still allowed on listings). */
  isAcceptingNewWork: boolean
  completedJobsCount: number
  createdAt: string
  fullName: string
  avatarUrl: string | null
  city: string | null
  bio: string | null
  skills: Array<{ id: string; name: string; categoryId: string | null }>
  services: Array<{ price: number; description: string | null }>
}

type CategoryItem = { id: string; name_ka: string; parent_id: string | null }
type SkillItem = { id: string; name: string; category_id: string | null }

const EMPTY_SUBCATEGORY_PARENT_MAP = new Map<string, string>()

const MAX_SEARCH_LENGTH = LIMITS.search
const MAX_PRICE = 999999
const MIN_PRICE = 0

function sanitizeText(text: string | null): string | null {
  return sanitizeDisplayText(text)
}

const mockFreelancers: FreelancerCardItem[] = [
  {
    id: "1",
    slug: "giorgi-beridze",
    fullName: "გიორგი ბერიძე",
    professionalTitle: "Full-Stack React Developer",
    city: "თბილისი",
    avatarUrl: null,
    averageRating: 4.8,
    totalReviewsCount: 24,
    completedJobsCount: 31,
    availability: "full_time",
    isAcceptingNewWork: true,
    skills: [
      { id: "r1", name: "React", categoryId: null },
      { id: "r2", name: "Node.js", categoryId: null },
      { id: "r3", name: "TypeScript", categoryId: null },
      { id: "r4", name: "PostgreSQL", categoryId: null },
      { id: "r5", name: "Tailwind", categoryId: null },
    ],
    services: [{ price: 600, description: null }],
    createdAt: new Date().toISOString(),
    bio: null,
  },
  {
    id: "2",
    slug: "nino-kapanadze",
    fullName: "ნინო კაპანაძე",
    professionalTitle: "UI/UX Designer & Brand Identity",
    city: "თბილისი",
    avatarUrl: null,
    averageRating: 5,
    totalReviewsCount: 18,
    completedJobsCount: 22,
    availability: "part_time",
    isAcceptingNewWork: true,
    skills: [
      { id: "d1", name: "Figma", categoryId: null },
      { id: "d2", name: "Adobe XD", categoryId: null },
      { id: "d3", name: "Illustrator", categoryId: null },
      { id: "d4", name: "Branding", categoryId: null },
    ],
    services: [{ price: 400, description: null }],
    createdAt: new Date().toISOString(),
    bio: null,
  },
  {
    id: "3",
    slug: "davit-mchedlishvili",
    fullName: "დავით მჭედლიშვილი",
    professionalTitle: "Digital Marketing & SEO სპეციალისტი",
    city: "ბათუმი",
    avatarUrl: null,
    averageRating: 4.6,
    totalReviewsCount: 9,
    completedJobsCount: 14,
    availability: "full_time",
    isAcceptingNewWork: true,
    skills: [
      { id: "m1", name: "SEO", categoryId: null },
      { id: "m2", name: "Google Ads", categoryId: null },
      { id: "m3", name: "Facebook Ads", categoryId: null },
      { id: "m4", name: "Analytics", categoryId: null },
    ],
    services: [{ price: 300, description: null }],
    createdAt: new Date().toISOString(),
    bio: null,
  },
  {
    id: "4",
    slug: "mariam-jikia",
    fullName: "მარიამ ჯიქია",
    professionalTitle: "კოპირაიტერი და კონტენტ მენეჯერი",
    city: "თბილისი",
    avatarUrl: null,
    averageRating: 4.9,
    totalReviewsCount: 31,
    completedJobsCount: 45,
    availability: "weekends",
    isAcceptingNewWork: true,
    skills: [
      { id: "w1", name: "კოპირაიტინგი", categoryId: null },
      { id: "w2", name: "SEO წერა", categoryId: null },
      { id: "w3", name: "სოც. მედია", categoryId: null },
      { id: "w4", name: "ბლოგინგი", categoryId: null },
    ],
    services: [{ price: 0, description: "შეთანხმებით" }],
    createdAt: new Date().toISOString(),
    bio: null,
  },
]

function getInitials(fullName: string) {
  const parts = fullName.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "ფ"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function isServiceNegotiable(service: { price: number; description: string | null }) {
  if (service.price === 0) return true
  const text = (service.description ?? "").toLowerCase()
  return text.includes("შეთანხმებით")
}

function getLowestPricedService(services: Array<{ price: number; description: string | null }>) {
  const priced = services.filter((service) => !isServiceNegotiable(service))
  if (priced.length === 0) return null
  return priced.reduce((lowest, current) => (current.price < lowest.price ? current : lowest), priced[0])
}

function stripListingMeta(raw: string | null) {
  if (!raw) return null
  const prefix = "<!--gigori-meta:"
  const suffix = "-->"
  if (!raw.startsWith(prefix)) return sanitizeText(stripLegacyPricePrefix(raw))
  const endIndex = raw.indexOf(suffix)
  if (endIndex < 0) return sanitizeText(stripLegacyPricePrefix(raw))
  return sanitizeText(stripLegacyPricePrefix(raw.slice(endIndex + suffix.length)))
}

const FREELANCER_PAGE_SIZE = 20

type BrowseFreelancersPage = {
  freelancers: FreelancerCardItem[]
  total: number
}

type BrowseCatalogData = {
  categories: CategoryItem[]
  skills: SkillItem[]
}

async function loadBrowseCatalog(): Promise<BrowseCatalogData> {
  if (!isSupabaseConfigured || !supabase) {
    return { categories: [], skills: [] }
  }
  const sb = supabase
  const [categoryRows, skillRows] = await Promise.all([
    fetchAllRowsByRange((from, to) =>
      sb
        .from("categories")
        .select("id,name_ka,parent_id")
        .eq("is_active", true)
        .order("sort_order")
        .range(from, to),
    ),
    fetchAllRowsByRange((from, to) =>
      sb.from("skills").select("id,name,category_id").eq("is_approved", true).order("name").range(from, to),
    ),
  ])
  return {
    categories: (categoryRows as { id?: string; name_ka?: string; parent_id?: string | null }[]).map((row) => ({
      id: String(row.id ?? ""),
      name_ka: String(row.name_ka ?? ""),
      parent_id: row.parent_id ?? null,
    })),
    skills: skillRows as SkillItem[],
  }
}

async function loadBrowseFreelancersPage(offset: number): Promise<BrowseFreelancersPage> {
  if (!isSupabaseConfigured || !supabase) {
    return { freelancers: mockFreelancers, total: mockFreelancers.length }
  }

  const { data, error: freelancersErr, count } = await supabase
    .from("freelancer_profiles")
    .select(
      `
            *,
            profiles:profiles!freelancer_profiles_user_id_fkey (full_name, avatar_url, city),
            freelancer_skills (
              skills (id, name, category_id)
            ),
            services (price, description)
          `,
      { count: "exact" },
    )
    .eq("is_public", true)
    .order("average_rating", { ascending: false })
    .range(offset, offset + FREELANCER_PAGE_SIZE - 1)

  if (freelancersErr) throw freelancersErr

  const mapped: FreelancerCardItem[] = (data ?? []).map((item: any) => {
    const skillRows =
      item.freelancer_skills
        ?.map((fs: any) => fs.skills)
        .filter(Boolean)
        .map((skill: any) => ({
          id: skill.id,
          name: skill.name,
          categoryId: skill.category_id ?? null,
        })) ?? []

    const serviceRows =
      item.services?.map((service: any) => ({
        price: service.price,
        description: stripListingMeta(service.description ?? null),
      })) ?? []

    return {
      id: item.id,
      slug: item.slug,
      professionalTitle: item.professional_title ?? "ფრილანსერი",
      averageRating: item.average_rating ?? 0,
      totalReviewsCount: item.total_reviews_count ?? 0,
      availability: item.availability ?? null,
      isAcceptingNewWork: item.is_accepting_new_work !== false,
      completedJobsCount: Number(item.completed_jobs_count ?? 0),
      createdAt: item.created_at,
      fullName: item.profiles?.full_name ?? "ფრილანსერი",
      avatarUrl: item.profiles?.avatar_url ?? null,
      city: item.profiles?.city ?? null,
      bio: item.bio ?? null,
      skills: skillRows,
      services: serviceRows,
    }
  })

  if (mapped.length > 0) {
    const fallbackByFp = Object.fromEntries(mapped.map((item) => [item.id, item.completedJobsCount]))
    const countMap = await mergeFreelancerCompletedWorkCounts(
      supabase,
      mapped.map((item) => item.id),
      fallbackByFp,
    )
    for (const item of mapped) {
      item.completedJobsCount = countMap[item.id] ?? item.completedJobsCount
    }
  }

  const total = count ?? 0
  const freelancers = mapped.length > 0 || offset > 0 ? mapped : mockFreelancers

  return { freelancers, total }
}

function FreelancerCardInitials({ fullName }: { fullName: string }) {
  const initials = useMemo(() => getInitials(fullName), [fullName])
  return <>{initials}</>
}

export default function BrowsePage() {
  const [searchParams] = useSearchParams()
  const [advancedDropdownOpen, setAdvancedDropdownOpen] = useState(false)
  const advancedDropdownRef = useRef<HTMLDivElement>(null)
  const [sortBy, setSortBy] = useState<SortOption>("rating")

  const { data: catalog } = useQuery({
    queryKey: queryKeys.browseCatalog,
    queryFn: loadBrowseCatalog,
  })
  const categories = catalog?.categories ?? []
  const skills = catalog?.skills ?? []

  const {
    data: freelancersData,
    isLoading: loading,
    isError,
    error: freelancersError,
    fetchNextPage,
    hasNextPage: freelancersHasMore,
    isFetchingNextPage: freelancersLoadingMore,
    refetch,
  } = useInfiniteQuery({
    queryKey: queryKeys.browseFreelancers,
    queryFn: ({ pageParam }) => loadBrowseFreelancersPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const nextOffset = lastPageParam + FREELANCER_PAGE_SIZE
      if (nextOffset < lastPage.total) return nextOffset
      return undefined
    },
  })

  const error = isError ? queryErrorMessage(freelancersError, "მონაცემები ვერ ჩაიტვირთა.") : ""

  const freelancers = useMemo(() => {
    const merged: FreelancerCardItem[] = []
    for (const page of freelancersData?.pages ?? []) {
      merged.push(...page.freelancers)
    }
    return merged
  }, [freelancersData?.pages])

  const [searchText, setSearchText] = useState("")
  const [filterRootCategoryId, setFilterRootCategoryId] = useState("")
  const [filterMidCategoryId, setFilterMidCategoryId] = useState("")
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [availabilityFilters, setAvailabilityFilters] = useState<Availability[]>([])
  const [minimumRating, setMinimumRating] = useState<0 | 3 | 4 | 5>(0)
  const [minPrice, setMinPrice] = useState("")
  const [maxPrice, setMaxPrice] = useState("")
  /** '' | LOCATION_REMOTE | LOCATION_HYBRID | Georgian city label */
  const [locationFilter, setLocationFilter] = useState("")

  const [draftSkillIds, setDraftSkillIds] = useState<string[]>([])
  const [draftAvailability, setDraftAvailability] = useState<Availability[]>([])
  const [draftMinRating, setDraftMinRating] = useState<0 | 3 | 4 | 5>(0)
  const [draftMinPrice, setDraftMinPrice] = useState("")
  const [draftMaxPrice, setDraftMaxPrice] = useState("")
  const [draftLocationFilter, setDraftLocationFilter] = useState("")

  const categoryRows = categories as CategoryBranchRow[]
  const categoryRootsList = useMemo(() => categoryRoots(categoryRows), [categoryRows])
  const categoryMidsList = useMemo(
    () => (filterRootCategoryId ? categoryChildrenOf(categoryRows, filterRootCategoryId) : []),
    [categoryRows, filterRootCategoryId],
  )
  const catalogFilterEffectiveId = useMemo(
    () => effectiveCatalogFilterId(filterRootCategoryId, filterMidCategoryId, ""),
    [filterRootCategoryId, filterMidCategoryId],
  )

  useEffect(() => {
    document.title = "ფრილანსერები — გიგორი"
    return () => {
      document.title = "გიგორი"
    }
  }, [])

  useEffect(() => {
    const query = searchParams.get("q")
    const category = searchParams.get("category")
    if (query) setSearchText(query)
    if (category && categories.length > 0) {
      const id = category.trim()
      const byId = new Map(categories.map((c) => [c.id, c]))
      const row = byId.get(id)
      if (!row) {
        setFilterRootCategoryId(id)
        setFilterMidCategoryId("")
      } else if (!row.parent_id) {
        setFilterRootCategoryId(id)
        setFilterMidCategoryId("")
      } else {
        setFilterRootCategoryId(rootIdContainingCategory(categories as CategoryBranchRow[], id))
        setFilterMidCategoryId(id)
      }
    } else if (!category?.trim()) {
      setFilterRootCategoryId("")
      setFilterMidCategoryId("")
    }
  }, [searchParams, categories])

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
    setSelectedSkillIds(draftSkillIds)
    setAvailabilityFilters(draftAvailability)
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

  const skillCountMap = useMemo(() => {
    return freelancers.reduce<Record<string, number>>((acc, freelancer) => {
      freelancer.skills.forEach((skill) => {
        acc[skill.id] = (acc[skill.id] ?? 0) + 1
      })
      return acc
    }, {})
  }, [freelancers])

  const topSkills = useMemo(() => {
    return [...skills]
      .sort((a, b) => (skillCountMap[b.id] ?? 0) - (skillCountMap[a.id] ?? 0))
      .slice(0, 15)
  }, [skills, skillCountMap])

  const categoryMatchingSkillIds = useMemo(() => {
    if (!catalogFilterEffectiveId) return null
    const matchingIds = new Set<string>()
    for (const skill of skills) {
      if (
        catalogSelectionMatchesEntity(
          categories as CategoryBranchRow[],
          catalogFilterEffectiveId,
          { categoryId: skill.category_id, subcategoryId: null },
          EMPTY_SUBCATEGORY_PARENT_MAP,
        )
      ) {
        matchingIds.add(skill.id)
      }
    }
    return matchingIds
  }, [catalogFilterEffectiveId, categories, skills])

  const clearFilters = () => {
    setSearchText("")
    setFilterRootCategoryId("")
    setFilterMidCategoryId("")
    setSelectedSkillIds([])
    setAvailabilityFilters([])
    setMinimumRating(0)
    setMinPrice("")
    setMaxPrice("")
    setLocationFilter("")
    clearDraftAdvanced()
    setAdvancedDropdownOpen(false)
    setSortBy("rating")
  }

  const filteredFreelancers = useMemo(() => {
    const search = searchText.trim().toLowerCase()
    const minPriceNumber = minPrice ? Number(minPrice) : null
    const maxPriceNumber = maxPrice ? Number(maxPrice) : null

    return freelancers.filter((freelancer) => {
      const hasSearchMatch = search.length === 0 || freelancer.fullName.toLowerCase().includes(search)
      if (!hasSearchMatch) return false

      const hasCategoryMatch =
        !categoryMatchingSkillIds ||
        freelancer.skills.some((skill) => categoryMatchingSkillIds.has(skill.id))
      if (!hasCategoryMatch) return false

      const hasAllSkills =
        selectedSkillIds.length === 0 ||
        selectedSkillIds.every((skillId) => freelancer.skills.some((skill) => skill.id === skillId))
      if (!hasAllSkills) return false

      const hasAvailability =
        availabilityFilters.length === 0 ||
        (freelancer.availability !== null &&
          availabilityFilters.includes(freelancer.availability as Availability))
      if (!hasAvailability) return false

      if (minimumRating > 0 && freelancer.averageRating < minimumRating) return false

      const lowestService = getLowestPricedService(freelancer.services)
      const lowestPrice = lowestService?.price ?? null
      if (minPriceNumber !== null && (lowestPrice === null || lowestPrice < minPriceNumber)) return false
      if (maxPriceNumber !== null && (lowestPrice === null || lowestPrice > maxPriceNumber)) return false

      if (!matchesLocationFilter(freelancer, locationFilter)) return false

      return true
    })
  }, [
    freelancers,
    searchText,
    categoryMatchingSkillIds,
    selectedSkillIds,
    availabilityFilters,
    minimumRating,
    minPrice,
    maxPrice,
    locationFilter,
  ])

  const sortedFreelancers = useMemo(() => {
    if (sortBy === "rating") {
      return filteredFreelancers.toSorted((a, b) => b.averageRating - a.averageRating)
    }
    if (sortBy === "price_asc") {
      return filteredFreelancers.toSorted((a, b) => {
        const aPrice = getLowestPricedService(a.services)?.price ?? Number.MAX_SAFE_INTEGER
        const bPrice = getLowestPricedService(b.services)?.price ?? Number.MAX_SAFE_INTEGER
        return aPrice - bPrice
      })
    }
    if (sortBy === "price_desc") {
      return filteredFreelancers.toSorted((a, b) => {
        const aPrice = getLowestPricedService(a.services)?.price ?? -1
        const bPrice = getLowestPricedService(b.services)?.price ?? -1
        return bPrice - aPrice
      })
    }
    if (sortBy === "newest") {
      return filteredFreelancers.toSorted((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    }
    return filteredFreelancers.toSorted((a, b) => b.completedJobsCount - a.completedJobsCount)
  }, [filteredFreelancers, sortBy])

  const availabilityLabel: Record<Availability, string> = {
    full_time: "სრული განაკვეთი",
    part_time: "ნახევარი განაკვეთი",
    weekends: "შაბათ-კვირა",
  }

  const toggleDraftAvailability = (value: Availability) => {
    setDraftAvailability((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    )
  }

  const toggleDraftSkill = (skillId: string) => {
    setDraftSkillIds((prev) =>
      prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId],
    )
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

  return (
    <div className="min-h-screen bg-white page-enter">
      <main className="mx-auto w-full max-w-7xl px-6 py-6 font-sans text-slate-600 md:px-8 md:py-8">
        <section className="p-1 md:p-0">
          <div className="mt-5 p-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="min-w-[220px] flex-[0_1_320px]">
                <input
                  value={searchText}
                  onChange={(event) => {
                    const value = event.target.value
                    if (value.length <= MAX_SEARCH_LENGTH) {
                      setSearchText(normalizeSearchInput(value))
                    }
                  }}
                  className="h-10 w-full rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-500 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:ring-2 focus:ring-[#0088FF]"
                  placeholder="ძიება"
                />
                {searchText.length >= 80 ? (
                  <p className="mt-0.5 text-xs text-slate-400">
                    {searchText.length}/{MAX_SEARCH_LENGTH}
                  </p>
                ) : null}
              </div>

              <label className="relative inline-flex h-10 min-w-[9rem] max-w-[11rem] shrink-0 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-500">
                <span className="pointer-events-none min-w-0 flex-1 truncate">კატეგორია</span>
                <span className="shrink-0 text-slate-400">▾</span>
                <select
                  value={filterRootCategoryId}
                  onChange={(event) => {
                    setFilterRootCategoryId(event.target.value)
                    setFilterMidCategoryId("")
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

              <label className="relative inline-flex h-10 min-w-[9rem] max-w-[11rem] shrink-0 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-500">
                <span className="pointer-events-none min-w-0 flex-1 truncate">ქვეკატეგორია</span>
                <span className="shrink-0 text-slate-400">▾</span>
                <select
                  value={filterMidCategoryId}
                  disabled={!filterRootCategoryId || categoryMidsList.length === 0}
                  onChange={(event) => setFilterMidCategoryId(event.target.value)}
                  className="absolute inset-0 z-10 h-full w-full min-h-[2.5rem] min-w-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  aria-label="ქვეკატეგორია"
                >
                  <option value="">
                    {!filterRootCategoryId
                      ? "ჯერ კატეგორია"
                      : categoryMidsList.length === 0
                        ? "არ არის"
                        : "ყველა"}
                  </option>
                  {categoryMidsList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_ka}
                    </option>
                  ))}
                </select>
              </label>

              <div className="relative" ref={advancedDropdownRef}>
                <button
                  type="button"
                  aria-expanded={advancedDropdownOpen}
                  aria-haspopup="dialog"
                  onClick={() => (advancedDropdownOpen ? setAdvancedDropdownOpen(false) : openAdvancedDropdown())}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-500 transition hover:border-slate-400"
                >
                  <span aria-hidden></span>
                  <span>დეტალური ძებნა</span>
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
                            <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">მინ. რეიტინგი</span>
                            <select
                              value={draftMinRating}
                              onChange={(event) => {
                                const value = Number(event.target.value)
                                if ([0, 3, 4, 5].includes(value)) {
                                  setDraftMinRating(value as 0 | 3 | 4 | 5)
                                }
                              }}
                              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#0088FF] focus:ring-2"
                            >
                              <option value={0}>ნებისმიერი</option>
                              <option value={3}>3+</option>
                              <option value={4}>4+</option>
                              <option value={5}>5</option>
                            </select>
                          </label>

                          <div>
                            <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">ფასის დიაპაზონი (₾)</p>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                min={0}
                                value={draftMinPrice}
                                onChange={(event) => {
                                  const value = event.target.value
                                  const numValue = Number(value)
                                  if (value === "" || (Number.isFinite(numValue) && numValue >= MIN_PRICE && numValue <= MAX_PRICE)) {
                                    setDraftMinPrice(value)
                                  }
                                }}
                                placeholder="მინ"
                                className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#0088FF] focus:ring-2"
                              />
                              <input
                                type="number"
                                min={0}
                                value={draftMaxPrice}
                                onChange={(event) => {
                                  const value = event.target.value
                                  const numValue = Number(value)
                                  if (value === "" || (Number.isFinite(numValue) && numValue >= MIN_PRICE && numValue <= MAX_PRICE)) {
                                    setDraftMaxPrice(value)
                                  }
                                }}
                                placeholder="მაქს"
                                className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#0088FF] focus:ring-2"
                              />
                            </div>
                          </div>

                          <label className="block pb-1">
                            <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">ლოკაცია</span>
                            <LocationFilterSelect
                              value={draftLocationFilter}
                              onChange={setDraftLocationFilter}
                              className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none ring-[#0088FF] focus:ring-2"
                            />
                          </label>
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

              <label className="relative inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-500">
                <span aria-hidden></span>
                <span className="truncate">სორტირება</span>
                <span className="ml-auto text-slate-400">▾</span>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortOption)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="სორტირება"
                >
                  <option value="rating">რეიტინგი</option>
                  <option value="price_asc">ფასი: იაფიდან</option>
                  <option value="price_desc">ფასი: ძვირიდან</option>
                  <option value="newest">ახალი</option>
                  <option value="completed">შესრულებული სამუშაო</option>
                </select>
              </label>

              <button
                type="button"
                disabled={loading || freelancersLoadingMore}
                onClick={() => setAdvancedDropdownOpen(false)}
                className="ml-auto inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#0088FF] px-8 text-base font-bold text-white transition hover:bg-[#006ACC] disabled:cursor-not-allowed disabled:opacity-50"
              >
                ძიება
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 min-w-0">
          {error ? (
            <ErrorState message={error} onRetry={() => void refetch()} />
          ) : loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonCard key={`skeleton-${index}`} avatar lines={4} />
              ))}
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-600">მოიძებნა {sortedFreelancers.length} ფრილანსერი</p>
              </div>

              {sortedFreelancers.length === 0 ? (
                <EmptyState
                  message="ფრილანსერები ჯერ არ არიან. მალე დაემატება!"
                  actionLabel="ფილტრების გასუფთავება"
                  onAction={clearFilters}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {sortedFreelancers.map((freelancer) => {
                    const lowestPricedService = getLowestPricedService(freelancer.services)
                    const negotiable = !lowestPricedService

                    return (
                      <div
                        key={freelancer.id}
                        className="relative flex h-full flex-col rounded-2xl border border-slate-200/80 bg-transparent p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white/40"
                      >
                        <Link
                          to={`/freelancer/${freelancer.slug}`}
                          className="group flex min-h-0 flex-1 flex-col text-inherit no-underline"
                        >
                        <div className="flex items-start gap-3">
                          <FreelancerAvailabilityIndicator
                            available={freelancer.isAcceptingNewWork}
                            labelWhenAvailable="ახალი სამუშაოებისთვის ხელმისაწვდომია."
                            labelWhenUnavailable="ახალი სამუშაოებისთვის დროებით ხელმიუწვდომელია."
                          >
                            {freelancer.avatarUrl ? (
                              <div className="relative h-16 w-16">
                                <img
                                  src={avatarImageUrl(supabase, freelancer.avatarUrl) ?? freelancer.avatarUrl}
                                  alt={`${freelancer.fullName} ავატარი`}
                                  loading="lazy"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none"
                                    e.currentTarget.parentElement?.querySelector(".avatar-fallback")?.classList.remove("hidden")
                                  }}
                                  className="h-16 w-16 rounded-full object-cover"
                                />
                                <div className="avatar-fallback absolute inset-0 hidden flex h-16 w-16 items-center justify-center rounded-full bg-[#1B2B4B] text-lg font-bold text-white">
                                  <FreelancerCardInitials fullName={freelancer.fullName} />
                                </div>
                              </div>
                            ) : (
                              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1B2B4B] text-lg font-bold text-white">
                                <FreelancerCardInitials fullName={freelancer.fullName} />
                              </div>
                            )}
                          </FreelancerAvailabilityIndicator>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-lg font-bold text-[#1B2B4B]">{freelancer.fullName}</p>
                            <p className="truncate text-sm text-slate-500">{freelancer.professionalTitle}</p>
                          </div>
                        </div>

                        {freelancer.totalReviewsCount > 0 ? (
                          <div
                            className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-0.5"
                            aria-label={`საშუალო რეიტინგი ${freelancer.averageRating.toFixed(1)}, ${freelancer.totalReviewsCount} შეფასება`}
                          >
                            <span className="text-sm font-semibold tabular-nums text-[#1B2B4B]">
                              {freelancer.averageRating.toFixed(1)}
                            </span>
                            <span className="text-xs text-slate-500">
                              · {freelancer.totalReviewsCount} შეფასება
                            </span>
                          </div>
                        ) : null}

                        <p className="mt-3 text-sm font-semibold text-[#1B2B4B]">
                          {lowestPricedService
                            ? negotiable
                              ? "შეთანხმებით"
                              : `₾${lowestPricedService.price} დან`
                            : "ფასი შეთანხმებით"}
                        </p>

                        <p className="mt-2 text-xs text-slate-500">💼 {freelancer.completedJobsCount} შესრულებული</p>
                        </Link>

                        <div className="mt-auto flex shrink-0 gap-2 pt-3">
                          <SaveBookmarkButton
                            variant="icon"
                            resourceType="freelancer"
                            resourceId={freelancer.id}
                          />
                          <Link
                            to={`/freelancer/${freelancer.slug}`}
                            className="inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-full bg-[#0088FF] px-4 text-sm font-semibold text-white transition hover:bg-[#006ACC]"
                          >
                            პროფილის ნახვა
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {freelancersHasMore ? (
                <div className="mt-5">
                  <button
                    type="button"
                    disabled={freelancersLoadingMore}
                    onClick={() => void fetchNextPage()}
                    className="h-11 rounded-lg border border-[#1B2B4B] px-4 text-sm font-semibold text-[#1B2B4B]"
                  >
                    მეტის ჩატვირთვა
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </main>
    </div>
  )
}
