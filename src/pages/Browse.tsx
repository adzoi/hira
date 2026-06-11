import { useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { Link, useSearchParams } from "react-router-dom"
import { OptimizedImage } from "../components/OptimizedImage.tsx"
import EmptyState from "../components/ui/EmptyState.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import { mergeFreelancerCompletedWorkCounts } from "../lib/freelancerCompletedWorkCounts.ts"
import { META_SUFFIX, resolveListingMetaPrefix, stripLegacyPricePrefix } from "../lib/listingDescription.ts"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { fetchAllRowsByRange } from "../lib/supabaseFetchPaged.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { usePageMeta } from "../lib/usePageMeta.tsx"
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
import MarketplaceCatalogToolbar, { marketplaceFilterPillClass } from "../components/MarketplaceCatalogToolbar.tsx"
import { LIMITS, normalizeSearchInput, sanitizeDisplayText } from "../lib/validation.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { pickCategoryName } from "../lib/categoryLocale.ts"

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

type CategoryItem = { id: string; name_ka: string; name_en?: string | null; parent_id: string | null }
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
  const metaPrefix = raw ? resolveListingMetaPrefix(raw) : null
  if (!metaPrefix) return sanitizeText(stripLegacyPricePrefix(raw))
  const endIndex = raw.indexOf(META_SUFFIX)
  if (endIndex < 0) return sanitizeText(stripLegacyPricePrefix(raw))
  return sanitizeText(stripLegacyPricePrefix(raw.slice(endIndex + META_SUFFIX.length)))
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
        .select("id,name_ka,name_en,parent_id")
        .eq("is_active", true)
        .order("sort_order")
        .range(from, to),
    ),
    fetchAllRowsByRange((from, to) =>
      sb.from("skills").select("id,name,category_id").eq("is_approved", true).order("name").range(from, to),
    ),
  ])
  return {
    categories: (categoryRows as { id?: string; name_ka?: string; name_en?: string | null; parent_id?: string | null }[]).map(
      (row) => ({
        id: String(row.id ?? ""),
        name_ka: String(row.name_ka ?? ""),
        name_en: row.name_en ?? null,
        parent_id: row.parent_id ?? null,
      }),
    ),
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
  const { t, locale } = useTranslation()
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

  const error = isError ? queryErrorMessage(freelancersError, t("common.dataLoadFailed")) : ""

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

  const availabilityLabel: Record<Availability, string> = useMemo(
    () => ({
      full_time: t("common.availabilityFullTime"),
      part_time: t("common.availabilityPartTime"),
      weekends: t("common.availabilityWeekends"),
    }),
    [t],
  )

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

  const browseCategoryFilterSlot = (
    <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:items-center sm:gap-1.5">
      <label className={`${marketplaceFilterPillClass} min-w-0 sm:min-w-[9rem] sm:max-w-[11rem] sm:shrink-0`}>
        <span className="pointer-events-none min-w-0 flex-1 truncate">{t("common.category")}</span>
        <span className="shrink-0 text-slate-400">▾</span>
        <select
          value={filterRootCategoryId}
          onChange={(event) => {
            setFilterRootCategoryId(event.target.value)
            setFilterMidCategoryId("")
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

      <label className={`${marketplaceFilterPillClass} min-w-0 sm:min-w-[9rem] sm:max-w-[11rem] sm:shrink-0`}>
        <span className="pointer-events-none min-w-0 flex-1 truncate">{t("common.subcategory")}</span>
        <span className="shrink-0 text-slate-400">▾</span>
        <select
          value={filterMidCategoryId}
          disabled={!filterRootCategoryId || categoryMidsList.length === 0}
          onChange={(event) => setFilterMidCategoryId(event.target.value)}
          className="absolute inset-0 z-10 h-full w-full min-h-[2.5rem] min-w-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          aria-label={t("common.subcategory")}
        >
          <option value="">
            {!filterRootCategoryId
              ? t("common.categoryFirst")
              : categoryMidsList.length === 0
                ? t("common.none")
                : t("common.all")}
          </option>
          {categoryMidsList.map((c) => (
            <option key={c.id} value={c.id}>
              {pickCategoryName(c, locale)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )

  const browseAdvancedBody = (
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
        <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("browse.minRating")}</span>
        <select
          value={draftMinRating}
          onChange={(event) => {
            const value = Number(event.target.value)
            if ([0, 3, 4, 5].includes(value)) {
              setDraftMinRating(value as 0 | 3 | 4 | 5)
            }
          }}
          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
        >
          <option value={0}>{t("common.anyLocation")}</option>
          <option value={3}>3+</option>
          <option value={4}>4+</option>
          <option value={5}>5</option>
        </select>
      </label>

      <div>
        <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">{t("browse.priceRange")}</p>
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
            placeholder={t("common.min")}
            className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
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
            placeholder={t("common.max")}
            className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
          />
        </div>
      </div>

      <label className="block pb-1">
        <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("common.location")}</span>
        <LocationFilterSelect
          value={draftLocationFilter}
          onChange={setDraftLocationFilter}
          className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
        />
      </label>
    </>
  )

  return (

    <>
    {usePageMeta(t("browse.title"), t("browse.metaDescription"))}

    <div className="min-h-screen bg-white page-enter">
      <main className="mx-auto w-full max-w-7xl px-6 py-6 font-sans text-slate-600 md:px-8 md:py-8">
        <section className="p-1 md:p-0">
          <MarketplaceCatalogToolbar
            eyebrow=""
            title=""
            showPageHeader={false}
            searchValue={searchText}
            onSearchChange={(value) => {
              if (value.length <= MAX_SEARCH_LENGTH) {
                setSearchText(normalizeSearchInput(value))
              }
            }}
            searchPlaceholder={t("common.search")}
            categorySlot={browseCategoryFilterSlot}
            advancedSearchLabel={t("listings.detailedSearch")}
            sortValue={sortBy}
            onSortChange={(value) => setSortBy(value as SortOption)}
            sortOptions={[
              { value: "rating", label: t("common.rating") },
              { value: "price_asc", label: t("common.priceAsc") },
              { value: "price_desc", label: t("common.priceDesc") },
              { value: "newest", label: t("browse.sortNewest") },
              { value: "completed", label: t("common.completedJobsSort") },
            ]}
            advancedDropdownOpen={advancedDropdownOpen}
            advancedFilterCount={advancedFilterCount}
            onToggleAdvanced={openAdvancedDropdown}
            advancedDropdownRef={advancedDropdownRef}
            onDismissAdvanced={() => setAdvancedDropdownOpen(false)}
            onSaveAdvanced={saveAdvancedFilters}
            onClearDraftAdvanced={clearDraftAdvanced}
            childrenAdvancedBody={browseAdvancedBody}
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
                <p className="text-sm font-medium text-slate-600">{t("browse.found", { count: sortedFreelancers.length })}</p>
              </div>

              {sortedFreelancers.length === 0 ? (
                <EmptyState
                  message={t("browse.empty")}
                  actionLabel={t("common.clearFilters")}
                  onAction={clearFilters}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                            labelWhenAvailable={t("common.availableNewWork")}
                            labelWhenUnavailable={t("common.unavailableNewWork")}
                          >
                            {freelancer.avatarUrl ? (
                              <div className="relative h-16 w-16">
                                <OptimizedImage
                                  src={avatarImageUrl(supabase, freelancer.avatarUrl) ?? freelancer.avatarUrl}
                                  alt={t("common.avatarAlt", { name: freelancer.fullName })}
                                  width={64}
                                  height={64}
                                  onError={(e) => {
                                    e.currentTarget.classList.add("hidden")
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
                            aria-label={t("common.avgRatingAria", {
                              rating: freelancer.averageRating.toFixed(1),
                              count: freelancer.totalReviewsCount,
                            })}
                          >
                            <span className="text-sm font-semibold tabular-nums text-[#1B2B4B]">
                              {freelancer.averageRating.toFixed(1)}
                            </span>
                            <span className="text-xs text-slate-500">
                              · {t("common.reviewsCount", { count: freelancer.totalReviewsCount })}
                            </span>
                          </div>
                        ) : null}

                        <p className="mt-3 text-sm font-semibold text-[#1B2B4B]">
                          {lowestPricedService
                            ? negotiable
                              ? t("common.negotiable")
                              : t("common.fromPrice", { price: lowestPricedService.price })
                            : t("common.priceOnRequest")}
                        </p>

                        <p className="mt-2 text-xs text-slate-500">💼 {t("common.completed", { count: freelancer.completedJobsCount })}</p>
                        </Link>

                        <div className="mt-auto flex shrink-0 gap-2 pt-3">
                          <SaveBookmarkButton
                            variant="icon"
                            resourceType="freelancer"
                            resourceId={freelancer.id}
                          />
                          <Link
                            to={`/freelancer/${freelancer.slug}`}
                            className="inline-flex h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-full bg-[#0088FF] px-4 text-sm font-semibold text-white transition hover:bg-[#006ACC]"
                          >
                            {t("nav.viewProfile")}
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
                    {t("common.loadMore")}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </main>
    </div>
  </>
  )
}
