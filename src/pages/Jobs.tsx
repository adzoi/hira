import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Link, useSearchParams } from "react-router-dom"
import { OptimizedImage } from "../components/OptimizedImage.tsx"
import SaveBookmarkButton from "../components/SaveBookmarkButton.tsx"
import EmptyState from "../components/ui/EmptyState.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import MarketplaceCatalogToolbar, { marketplaceFilterPillClass } from "../components/MarketplaceCatalogToolbar.tsx"
import LocationFilterSelect from "../components/LocationFilterSelect.tsx"
import { fetchAllRowsByRange } from "../lib/supabaseFetchPaged.ts"
import { fetchJobsPagePayload } from "../lib/marketplaceEdge.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { isSupabaseConfigured, supabase, formatSupabaseClientError } from "../lib/supabase"
import { usePageMeta } from "../lib/usePageMeta.tsx"
import { jobVacancyStats } from "../lib/jobVacancies.ts"
import { formatCityForDisplay, jobMatchesUnifiedLocation } from "../lib/marketplaceFilters.ts"
import { jobVipIsActive } from "../lib/vipStatus.ts"
import VipBadge from "../components/VipBadge.tsx"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import {
  catalogSelectionMatchesEntity,
  categoryChildrenOf,
  categoryRoots,
  effectiveCatalogFilterId,
  type CategoryBranchRow,
} from "../lib/marketplaceCategoryTree.ts"
import { formatJobBudget, PRICE_TYPE_LABELS } from "../lib/listingPrice.ts"
import {
  localizedNameFromMap,
  pickCategoryName,
  type LocalizedNameEntry,
} from "../lib/categoryLocale.ts"
import { pickListingDescription, pickListingTitle } from "../lib/listingLocale.ts"
import { normalizeSearchInput } from "../lib/validation.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import type { AppLocale } from "../i18n/types.ts"

type SortOption = "newest" | "budget_high" | "budget_low" | "applicants" | "deadline"
type BudgetType = "fixed" | "hourly" | "monthly"
type DurationType = "one_time" | "ongoing"

type JobItem = {
  id: string
  categoryId: string
  title: string
  titleEn: string | null
  description: string
  descriptionEn: string | null
  imagePath: string | null
  createdAt: string
  budgetType: string
  budgetMin: number | null
  budgetMax: number | null
  locationType: string
  durationType: string
  isUrgent: boolean
  isBeginnerFriendly: boolean
  isInternship: boolean
  applicationDeadline: string | null
  categoryName: string
  subcategoryName: string | null
  subcategoryId: string | null
  companyName: string
  companyAvatar: string | null
  city: string | null
  skills: Array<{ id: string; name: string }>
  applicantsCount: number
  viewsCount: number
  /** True when job has active paid VIP placement (not expired). */
  vipActive: boolean
  vacancies: number
  acceptedCount: number
  vacancyRemaining: number
  vacancyFull: boolean
}

type CategoryItem = { id: string; name_ka: string; name_en?: string | null; parent_id: string | null }

function jobCategoryLabel(job: JobItem, categories: CategoryItem[], locale: AppLocale): string {
  const cat = categories.find((c) => c.id === job.categoryId)
  if (cat) return pickCategoryName(cat, locale)
  return job.categoryName
}

function jobSubcategoryLabel(
  job: JobItem,
  subcategoryNamesById: Map<string, LocalizedNameEntry>,
  locale: AppLocale,
): string | null {
  if (job.subcategoryId) {
    return localizedNameFromMap(subcategoryNamesById, job.subcategoryId, locale) ?? job.subcategoryName
  }
  return job.subcategoryName
}

const mockJobs: JobItem[] = [
  {
    id: "1",
    categoryId: "mock-programming",
    title: "React Developer საჭიროა E-Commerce პროექტისთვის",
    titleEn: null,
    companyName: "TechStart Georgia",
    city: "თბილისი",
    categoryName: "პროგრამირება",
    subcategoryName: null,
    subcategoryId: null,
    description:
      "გვჭირდება გამოცდილი React დეველოპერი ონლაინ მაღაზიის შესაქმნელად. პროექტი მოიცავს პროდუქტების გვერდს, კალათას და გადახდის სისტემას.",
    descriptionEn: null,
    imagePath: null,
    budgetMin: 800,
    budgetMax: 1500,
    budgetType: "fixed",
    locationType: "remote",
    durationType: "one_time",
    isUrgent: true,
    isBeginnerFriendly: false,
    isInternship: false,
    skills: [
      { id: "s1", name: "React" },
      { id: "s2", name: "TypeScript" },
      { id: "s3", name: "Tailwind CSS" },
    ],
    applicantsCount: 3,
    viewsCount: 0,
    vipActive: false,
    vacancies: 1,
    acceptedCount: 0,
    vacancyRemaining: 1,
    vacancyFull: false,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    applicationDeadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    companyAvatar: null,
  },
  {
    id: "2",
    categoryId: "mock-design",
    title: "ლოგოს და ბრენდინგის დიზაინი სტარტაპისთვის",
    titleEn: null,
    companyName: "Startup Hub Tbilisi",
    city: "თბილისი",
    categoryName: "დიზაინი",
    subcategoryName: null,
    subcategoryId: null,
    description:
      "ვეძებთ კრეატიულ დიზაინერს ახალი ტექნოლოგიური სტარტაპის ვიზუალური იდენტობის შესაქმნელად. საჭიროა ლოგო, ფერთა პალიტრა და ბრენდბუქი.",
    descriptionEn: null,
    imagePath: null,
    budgetMin: 300,
    budgetMax: 600,
    budgetType: "fixed",
    locationType: "anywhere",
    durationType: "one_time",
    isUrgent: false,
    isBeginnerFriendly: false,
    isInternship: false,
    skills: [
      { id: "s4", name: "Figma" },
      { id: "s5", name: "Adobe Illustrator" },
      { id: "s6", name: "Branding" },
    ],
    applicantsCount: 7,
    viewsCount: 0,
    vipActive: false,
    vacancies: 2,
    acceptedCount: 1,
    vacancyRemaining: 1,
    vacancyFull: false,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    applicationDeadline: null,
    companyAvatar: null,
  },
  {
    id: "3",
    categoryId: "mock-marketing",
    title: "სოციალური მედიის მენეჯერი თვიური თანამშრომლობით",
    titleEn: null,
    companyName: "Café Leila",
    city: "თბილისი",
    categoryName: "მარკეტინგი",
    subcategoryName: null,
    subcategoryId: null,
    description:
      "კაფეს სოციალური მედიის მართვა Instagram და Facebook-ზე. კვირაში 3-4 პოსტი, სტორიები, კომენტარებზე პასუხი. ქართული და ინგლისური ენები.",
    descriptionEn: null,
    imagePath: null,
    budgetMin: 400,
    budgetMax: 400,
    budgetType: "monthly",
    locationType: "tbilisi",
    durationType: "ongoing",
    isUrgent: false,
    isBeginnerFriendly: false,
    isInternship: false,
    skills: [
      { id: "s7", name: "Instagram" },
      { id: "s8", name: "Facebook" },
      { id: "s9", name: "Content Creation" },
    ],
    applicantsCount: 12,
    viewsCount: 0,
    vipActive: false,
    vacancies: 1,
    acceptedCount: 0,
    vacancyRemaining: 1,
    vacancyFull: false,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    applicationDeadline: null,
    companyAvatar: null,
  },
  {
    id: "4",
    categoryId: "mock-writing",
    title: "ვებსაიტის ქართულ-ინგლისური თარგმანი",
    titleEn: null,
    companyName: "Georgian Tours Ltd",
    city: "თბილისი",
    categoryName: "წერა და თარგმანი",
    subcategoryName: null,
    subcategoryId: null,
    description:
      "80 გვერდიანი სატურისტო ვებსაიტის თარგმნა ინგლისურიდან ქართულზე. ტექსტი მოიცავს ტურების აღწერებს, ბლოგ პოსტებს და FAQ გვერდს.",
    descriptionEn: null,
    imagePath: null,
    budgetMin: 200,
    budgetMax: 350,
    budgetType: "fixed",
    locationType: "remote",
    durationType: "one_time",
    isUrgent: true,
    isBeginnerFriendly: false,
    isInternship: false,
    skills: [
      { id: "s10", name: "თარგმანი" },
      { id: "s11", name: "ქართული ენა" },
      { id: "s12", name: "ინგლისური ენა" },
    ],
    applicantsCount: 2,
    viewsCount: 0,
    vipActive: false,
    vacancies: 1,
    acceptedCount: 1,
    vacancyRemaining: 0,
    vacancyFull: true,
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    applicationDeadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    companyAvatar: null,
  },
]

function getInitials(value: string) {
  const parts = value.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "კ"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function formatRelativeTime(dateString: string) {
  const now = Date.now()
  const diffMs = now - new Date(dateString).getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))} წუთის წინ`
  if (diffMs < day) return `${Math.max(1, Math.floor(diffMs / hour))} საათის წინ`
  if (diffMs < 30 * day) return `${Math.max(1, Math.floor(diffMs / day))} დღის წინ`
  return new Date(dateString).toLocaleDateString("ka-GE")
}

function deadlineText(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString("ka-GE", { day: "2-digit", month: "short" })
}

function isDeadlineSoon(dateString: string) {
  const diff = new Date(dateString).getTime() - Date.now()
  return diff > 0 && diff <= 3 * 24 * 60 * 60 * 1000
}

const JOBS_PAGE_SIZE = 20

function mapRpcRowsToJobs(jobRows: unknown[]): JobItem[] {
  return jobRows.map((raw) => {
    const row = raw as Record<string, unknown>
    let skills: JobItem["skills"] = []
    const skillsRaw = row.skills
    if (Array.isArray(skillsRaw)) {
      skills = skillsRaw
        .map((item) => {
          const s = item as Record<string, unknown>
          return { id: String(s.id ?? ""), name: String(s.name ?? "").trim() }
        })
        .filter((s) => s.id && s.name)
    }

    const vipActive = jobVipIsActive(Boolean(row.is_vip), row.vip_expires_at != null ? String(row.vip_expires_at) : null)
    const imagePaths = Array.isArray(row.image_urls)
      ? (row.image_urls as unknown[]).map((v) => String(v)).filter(Boolean)
      : []
    const vac = jobVacancyStats(row.vacancies as number | null | undefined, row.accepted_count as number | null | undefined)

    return {
      id: String(row.id ?? ""),
      categoryId: String(row.category_id ?? ""),
      title: String(row.title ?? ""),
      titleEn: row.title_en != null ? String(row.title_en).trim() || null : null,
      description: String(row.description ?? ""),
      descriptionEn: row.description_en != null ? String(row.description_en).trim() || null : null,
      imagePath: imagePaths[0] ?? (row.image_path != null ? String(row.image_path) : null),
      createdAt: String(row.created_at ?? ""),
      budgetType: String(row.budget_type ?? ""),
      budgetMin: row.budget_min != null ? Number(row.budget_min) : null,
      budgetMax: row.budget_max != null ? Number(row.budget_max) : null,
      locationType: String(row.location_type ?? ""),
      durationType: String(row.duration_type ?? ""),
      isUrgent: Boolean(row.is_urgent),
      isBeginnerFriendly: Boolean(row.is_beginner_friendly),
      isInternship: Boolean(row.is_internship),
      applicationDeadline: row.application_deadline != null ? String(row.application_deadline) : null,
      categoryName: String(row.category_name ?? "").trim() || "კატეგორია",
      subcategoryName: row.subcategory_name != null ? String(row.subcategory_name) : null,
      subcategoryId: row.subcategory_id != null ? String(row.subcategory_id) : null,
      companyName:
        String(row.company_name ?? "").trim() ||
        String(row.full_name ?? "").trim() ||
        "დამქირავებელი",
      companyAvatar: row.avatar_url != null ? String(row.avatar_url) : null,
      city: row.city != null ? String(row.city) : null,
      skills,
      applicantsCount: Number(row.applicants_count ?? 0),
      viewsCount: Number(row.views_count ?? 0),
      vipActive,
      vacancies: vac.vacancies,
      acceptedCount: vac.acceptedCount,
      vacancyRemaining: vac.remaining,
      vacancyFull: vac.isFull,
    }
  })
}

type JobsCatalogPage = {
  jobs: JobItem[]
  categories: CategoryItem[]
  subcategoryParentById: Map<string, string>
  subcategoryNamesById: Map<string, LocalizedNameEntry>
  total: number
}

async function loadJobsCatalogPage(
  category: string,
  page: number,
  searchQuery: string | null = null,
): Promise<JobsCatalogPage> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      jobs: mockJobs,
      categories: [],
      subcategoryParentById: new Map(),
      subcategoryNamesById: new Map(),
      total: mockJobs.length,
    }
  }

  const client = supabase
  const payload = (await fetchJobsPagePayload(category, page, searchQuery)) as Record<string, unknown> | null
  const jobRows = Array.isArray(payload?.jobs) ? (payload.jobs as unknown[]) : []
  const categoryRows = Array.isArray(payload?.categories) ? (payload.categories as unknown[]) : []
  const totalRaw = payload?.total_count ?? payload?.total
  const total = Number(totalRaw)
  const safeTotal = Number.isFinite(total) ? total : 0

  const mappedJobs = mapRpcRowsToJobs(jobRows)
  const jobs = page === 1 && mappedJobs.length === 0 && !searchQuery ? mockJobs : mappedJobs

  const categories = categoryRows.map((c) => {
    const row = c as Record<string, unknown>
    return {
      id: String(row.id ?? ""),
      name_ka: String(row.name_ka ?? ""),
      name_en: (row.name_en as string | null | undefined) ?? null,
      parent_id: (row.parent_id as string | null | undefined) ?? null,
    }
  }) as CategoryItem[]

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
      console.warn("[jobs] subcategory filters unavailable:", subcategoryError)
    }
  }

  return { jobs, categories, subcategoryParentById, subcategoryNamesById, total: safeTotal }
}

export default function JobsPage() {
  const { t, locale } = useTranslation()
  const [searchParams] = useSearchParams()

  const [advancedDropdownOpen, setAdvancedDropdownOpen] = useState(false)
  const advancedDropdownRef = useRef<HTMLDivElement>(null)

  const [searchText, setSearchText] = useState("")
  const deferredSearchText = useDeferredValue(searchText)
  const serverSearchQuery = deferredSearchText.trim()
  const [filterRootCategoryId, setFilterRootCategoryId] = useState("")
  const [filterMidCategoryId, setFilterMidCategoryId] = useState("")
  const [filterSpecializationId, setFilterSpecializationId] = useState("")

  const [appliedBudgetTypes, setAppliedBudgetTypes] = useState<BudgetType[]>([])
  const [appliedBudgetMin, setAppliedBudgetMin] = useState("")
  const [appliedBudgetMax, setAppliedBudgetMax] = useState("")
  const [appliedDurations, setAppliedDurations] = useState<DurationType[]>([])
  const [appliedUrgentOnly, setAppliedUrgentOnly] = useState(false)
  const [appliedEntryLevelOnly, setAppliedEntryLevelOnly] = useState(() => searchParams.get("entry") === "1")
  const [appliedLocationFilter, setAppliedLocationFilter] = useState("")
  const [appliedSkillIds, setAppliedSkillIds] = useState<string[]>([])

  const [draftBudgetTypes, setDraftBudgetTypes] = useState<BudgetType[]>([])
  const [draftBudgetMin, setDraftBudgetMin] = useState("")
  const [draftBudgetMax, setDraftBudgetMax] = useState("")
  const [draftDurations, setDraftDurations] = useState<DurationType[]>([])
  const [draftUrgentOnly, setDraftUrgentOnly] = useState(false)
  const [draftEntryLevelOnly, setDraftEntryLevelOnly] = useState(false)
  const [draftLocationFilter, setDraftLocationFilter] = useState("")
  const [draftSkillIds, setDraftSkillIds] = useState<string[]>([])

  const [sortBy, setSortBy] = useState<SortOption>("newest")
  const [subcategoryParentById, setSubcategoryParentById] = useState<Map<string, string>>(() => new Map())
  const [subcategoryNamesById, setSubcategoryNamesById] = useState<Map<string, LocalizedNameEntry>>(() => new Map())

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

  const jobsCategoryKey = serverCategoryForFetch ?? "all"

  const {
    data: catalogData,
    isLoading: loading,
    isError,
    error: catalogError,
    fetchNextPage,
    hasNextPage: jobsHasMore,
    isFetchingNextPage: loadingMore,
    refetch,
  } = useInfiniteQuery({
    queryKey: queryKeys.jobsCatalog(jobsCategoryKey, serverSearchQuery),
    queryFn: ({ pageParam }) =>
      loadJobsCatalogPage(jobsCategoryKey, pageParam, serverSearchQuery || null),
    initialPageParam: 1,
    staleTime: 30_000,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const loadedOffset = lastPageParam * JOBS_PAGE_SIZE
      if (loadedOffset < lastPage.total) return lastPageParam + 1
      return undefined
    },
  })

  const error = isError
    ? queryErrorMessage(catalogError, formatSupabaseClientError(catalogError, "მონაცემები ვერ ჩაიტვირთა."))
    : ""

  const firstPage = catalogData?.pages[0]
  const categories = firstPage?.categories ?? []

  useEffect(() => {
    if (!firstPage) return
    if (firstPage.subcategoryParentById.size > 0) setSubcategoryParentById(firstPage.subcategoryParentById)
    if (firstPage.subcategoryNamesById.size > 0) setSubcategoryNamesById(firstPage.subcategoryNamesById)
  }, [firstPage])

  const jobs = useMemo(() => {
    const seen = new Set<string>()
    const merged: JobItem[] = []
    for (const page of catalogData?.pages ?? []) {
      for (const job of page.jobs) {
        if (!seen.has(job.id)) {
          seen.add(job.id)
          merged.push(job)
        }
      }
    }
    return merged
  }, [catalogData?.pages])

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
    if (!parent) return [] as { id: string; name_ka: string; name_en: string }[]
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

  const jobsCategoryFilterSlot = (
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
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
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
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
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
      <label className={`${marketplaceFilterPillClass} min-w-0`}>
        <span className="pointer-events-none min-w-0 flex-1 truncate">{t("common.specialization")}</span>
        <span className="shrink-0 text-slate-400">▾</span>
        <select
          value={filterSpecializationId}
          disabled={!specializationParentCategoryId || specializationOptions.length === 0}
          onChange={(event) => setFilterSpecializationId(event.target.value)}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          aria-label={t("common.specialization")}
        >
          <option value="">
            {!specializationParentCategoryId
              ? t("common.selectAbove")
              : specializationOptions.length === 0
                ? t("common.none")
                : t("common.all")}
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

  const budgetTypeLabels = PRICE_TYPE_LABELS

  const durationLabels: Record<DurationType, string> = useMemo(
    () => ({
      one_time: t("jobDetail.oneTime"),
      ongoing: t("jobDetail.ongoing"),
    }),
    [t],
  )

  const locationLabelsLegacy: Record<string, string> = useMemo(
    () => ({
      remote: t("common.remote"),
      tbilisi: "თბილისი",
      hybrid: t("common.hybrid"),
      anywhere: t("common.anywhere"),
    }),
    [t],
  )

  const topSkills = useMemo(() => {
    const count: Record<string, { id: string; name: string; n: number }> = {}
    for (const job of jobs) {
      for (const s of job.skills) {
        if (!count[s.id]) count[s.id] = { ...s, n: 0 }
        count[s.id].n += 1
      }
    }
    return Object.values(count)
      .sort((a, b) => b.n - a.n)
      .slice(0, 15)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute when loaded count changes, not every jobs identity
  }, [jobs.length])

  const toggleDraftBudget = (key: BudgetType) => {
    setDraftBudgetTypes((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))
  }

  const toggleDraftDuration = (key: DurationType) => {
    setDraftDurations((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))
  }

  const toggleDraftSkill = (skillId: string) => {
    setDraftSkillIds((prev) => (prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]))
  }

  const openAdvancedDropdown = () => {
    setDraftBudgetTypes([...appliedBudgetTypes])
    setDraftBudgetMin(appliedBudgetMin)
    setDraftBudgetMax(appliedBudgetMax)
    setDraftDurations([...appliedDurations])
    setDraftUrgentOnly(appliedUrgentOnly)
    setDraftEntryLevelOnly(appliedEntryLevelOnly)
    setDraftLocationFilter(appliedLocationFilter)
    setDraftSkillIds([...appliedSkillIds])
    setAdvancedDropdownOpen(true)
  }

  const saveAdvancedFilters = () => {
    setAppliedBudgetTypes([...draftBudgetTypes])
    setAppliedBudgetMin(draftBudgetMin)
    setAppliedBudgetMax(draftBudgetMax)
    setAppliedDurations([...draftDurations])
    setAppliedUrgentOnly(draftUrgentOnly)
    setAppliedEntryLevelOnly(draftEntryLevelOnly)
    setAppliedLocationFilter(draftLocationFilter)
    setAppliedSkillIds([...draftSkillIds])
    setAdvancedDropdownOpen(false)
  }

  const clearDraftAdvanced = () => {
    setDraftBudgetTypes([])
    setDraftBudgetMin("")
    setDraftBudgetMax("")
    setDraftDurations([])
    setDraftUrgentOnly(false)
    setDraftEntryLevelOnly(false)
    setDraftLocationFilter("")
    setDraftSkillIds([])
  }

  const clearFilters = () => {
    setSearchText("")
    setFilterRootCategoryId("")
    setFilterMidCategoryId("")
    setFilterSpecializationId("")
    setAppliedBudgetTypes([])
    setAppliedBudgetMin("")
    setAppliedBudgetMax("")
    setAppliedDurations([])
    setAppliedUrgentOnly(false)
    setAppliedEntryLevelOnly(false)
    setAppliedLocationFilter("")
    setAppliedSkillIds([])
    clearDraftAdvanced()
    setAdvancedDropdownOpen(false)
    setSortBy("newest")
  }

  const advancedFilterCount = useMemo(() => {
    let n = 0
    if (appliedBudgetTypes.length > 0) n += appliedBudgetTypes.length
    if (appliedBudgetMin.trim()) n += 1
    if (appliedBudgetMax.trim()) n += 1
    if (appliedDurations.length > 0) n += appliedDurations.length
    if (appliedUrgentOnly) n += 1
    if (appliedEntryLevelOnly) n += 1
    if (appliedLocationFilter.trim()) n += 1
    if (appliedSkillIds.length > 0) n += appliedSkillIds.length
    return n
  }, [
    appliedBudgetTypes,
    appliedBudgetMin,
    appliedBudgetMax,
    appliedDurations,
    appliedUrgentOnly,
    appliedEntryLevelOnly,
    appliedLocationFilter,
    appliedSkillIds,
  ])

  const filteredJobs = useMemo(() => {
    const minBudget = appliedBudgetMin ? Number(appliedBudgetMin) : null
    const maxBudget = appliedBudgetMax ? Number(appliedBudgetMax) : null

    return jobs.filter((job) => {
      if (
        catalogFilterEffectiveId &&
        !catalogSelectionMatchesEntity(
          categories as CategoryBranchRow[],
          catalogFilterEffectiveId,
          { categoryId: job.categoryId || null, subcategoryId: job.subcategoryId },
          subcategoryParentById,
        )
      ) {
        return false
      }

      if (appliedBudgetTypes.length > 0 && !appliedBudgetTypes.includes(job.budgetType as BudgetType)) {
        return false
      }

      if (minBudget !== null) {
        const jobBudgetMax = job.budgetMax ?? job.budgetMin ?? 0
        if (jobBudgetMax < minBudget) return false
      }
      if (maxBudget !== null) {
        const jobBudgetMin = job.budgetMin ?? job.budgetMax ?? 0
        if (jobBudgetMin > maxBudget) return false
      }

      if (!jobMatchesUnifiedLocation(job, appliedLocationFilter)) return false

      if (appliedDurations.length > 0 && !appliedDurations.includes(job.durationType as DurationType)) {
        return false
      }
      if (appliedUrgentOnly && !job.isUrgent) return false
      if (appliedEntryLevelOnly && !job.isBeginnerFriendly && !job.isInternship) return false

      if (
        appliedSkillIds.length > 0 &&
        !appliedSkillIds.every((id) => job.skills.some((s) => s.id === id))
      ) {
        return false
      }

      return true
    })
  }, [
    jobs,
    catalogFilterEffectiveId,
    categories,
    subcategoryParentById,
    appliedBudgetTypes,
    appliedBudgetMin,
    appliedBudgetMax,
    appliedLocationFilter,
    appliedDurations,
    appliedUrgentOnly,
    appliedEntryLevelOnly,
    appliedSkillIds,
  ])

  const sortedJobs = useMemo(() => {
    const list = [...filteredJobs]
    // When FTS is active, preserve server VIP + rank + recency order for the default sort.
    if (sortBy === "newest") {
      if (serverSearchQuery) return list
      return list.sort((a, b) => {
        const v = (b.vipActive ? 1 : 0) - (a.vipActive ? 1 : 0)
        if (v !== 0) return v
        return +new Date(b.createdAt) - +new Date(a.createdAt)
      })
    }
    if (sortBy === "budget_high") {
      return list.sort((a, b) => (b.budgetMax ?? b.budgetMin ?? 0) - (a.budgetMax ?? a.budgetMin ?? 0))
    }
    if (sortBy === "budget_low") {
      return list.sort(
        (a, b) =>
          (a.budgetMin ?? a.budgetMax ?? Number.MAX_SAFE_INTEGER) -
          (b.budgetMin ?? b.budgetMax ?? Number.MAX_SAFE_INTEGER),
      )
    }
    if (sortBy === "applicants") {
      return list.sort((a, b) => b.applicantsCount - a.applicantsCount)
    }
    return list.sort((a, b) => {
      const aTs = a.applicationDeadline ? +new Date(a.applicationDeadline) : Number.MAX_SAFE_INTEGER
      const bTs = b.applicationDeadline ? +new Date(b.applicationDeadline) : Number.MAX_SAFE_INTEGER
      return aTs - bTs
    })
  }, [filteredJobs, sortBy, serverSearchQuery])

  const budgetLabel = (job: JobItem) => formatJobBudget(job.budgetMin, job.budgetMax, job.budgetType)

  const locationIcon = (type: string) => (type === "remote" ? "🌐" : "📍")

  /** Outlined pills: #D1D5DB border, ~2px×10px padding, body #374151 (matches meta + skill row) */
  const tagChipClass =
    "inline-flex items-center rounded-full border border-[#D1D5DB] bg-white px-2.5 py-0.5 text-xs font-medium text-[#374151]"
  const metaPillClass = tagChipClass

  return (

    <>
    {usePageMeta(t("jobs.title"), t("jobs.metaDescription"))}

    <div className="min-h-screen bg-white page-enter">
      <main className="mx-auto w-full max-w-7xl px-6 py-6 font-sans text-slate-600 md:px-8 md:py-8">
        <section className="p-1 md:p-0">
          <MarketplaceCatalogToolbar
            eyebrow=""
            title=""
            showPageHeader={false}
            searchValue={searchText}
            onSearchChange={(value) => setSearchText(normalizeSearchInput(value))}
            searchPlaceholder={t("jobs.searchPlaceholder")}
            categorySlot={jobsCategoryFilterSlot}
            locationDisplay={appliedLocationFilter}
            sortValue={sortBy}
            onSortChange={(value) => setSortBy(value as SortOption)}
            sortOptions={[
              { value: "newest", label: t("jobs.sortNew") },
              { value: "budget_high", label: t("jobs.budgetHigh") },
              { value: "budget_low", label: t("jobs.budgetLow") },
              { value: "applicants", label: t("common.sortApplicants") },
              { value: "deadline", label: t("jobs.deadlineSoon") },
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
                <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">{t("common.skills")}</p>
                <div className="max-h-36 space-y-2 overflow-auto rounded-lg border border-slate-200 p-2">
                  {topSkills.map((skill) => (
                    <label key={skill.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={draftSkillIds.includes(skill.id)} onChange={() => toggleDraftSkill(skill.id)} />
                      {skill.name}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">{t("jobs.budgetType")}</p>
                <div className="space-y-2">
                  {(Object.keys(budgetTypeLabels) as BudgetType[]).map((key) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={draftBudgetTypes.includes(key)} onChange={() => toggleDraftBudget(key)} />
                      {budgetTypeLabels[key]}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">{t("jobs.budgetRange")} (₾)</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    value={draftBudgetMin}
                    onChange={(event) => setDraftBudgetMin(event.target.value)}
                    placeholder={t("common.min")}
                    className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                  />
                  <input
                    type="number"
                    min={0}
                    value={draftBudgetMax}
                    onChange={(event) => setDraftBudgetMax(event.target.value)}
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

              <div>
                <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">{t("jobs.duration")}</p>
                <div className="space-y-2">
                  {(Object.keys(durationLabels) as DurationType[]).map((key) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={draftDurations.includes(key)} onChange={() => toggleDraftDuration(key)} />
                      {durationLabels[key]}
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-[#1B2B4B]">
                <span>{t("common.urgentOnly")}</span>
                <input type="checkbox" checked={draftUrgentOnly} onChange={(event) => setDraftUrgentOnly(event.target.checked)} />
              </label>

              <label className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-[#1B2B4B]">
                <span>{t("entryLevel.filterLabel")}</span>
                <input
                  type="checkbox"
                  checked={draftEntryLevelOnly}
                  onChange={(event) => setDraftEntryLevelOnly(event.target.checked)}
                />
              </label>
            </>
            }
          />
        </section>

        {error ? (
          <div className="mt-6">
            <ErrorState message={error} onRetry={() => void refetch()} />
          </div>
        ) : loading ? (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonCard key={index} avatar lines={3} />
            ))}
          </div>
        ) : (
          <>
            <p className="mt-6 text-sm font-medium text-slate-600">{t("jobs.found", { count: sortedJobs.length })}</p>
            {sortedJobs.length === 0 ? (
              <div className="mt-6">
                <EmptyState message={t("jobs.empty")} actionLabel={t("common.clearFilters")} onAction={clearFilters} />
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {sortedJobs.map((job) => (
                  <article
                    key={job.id}
                    className="flex h-full w-full max-w-full flex-col rounded-2xl border border-slate-200/80 border-l-[3px] border-l-transparent bg-white p-4 shadow-sm transition-[border-left-color,box-shadow] duration-200 ease-out hover:border-l-[#0088FF] hover:shadow-[-4px_0_12px_rgba(0,136,255,0.25)]"
                  >
                    <div className="flex items-start gap-3">
                      {job.companyAvatar ? (
                        <OptimizedImage
                          src={avatarImageUrl(supabase, job.companyAvatar) ?? job.companyAvatar}
                          alt={t("common.avatarAlt", { name: job.companyName })}
                          width={56}
                          height={56}
                          className="h-14 w-14 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#1B2B4B] text-sm font-bold text-white">
                          {getInitials(job.companyName)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-bold text-gray-900">{job.companyName}</p>
                              {job.vipActive ? <VipBadge /> : null}
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {[formatCityForDisplay(job.city), formatRelativeTime(job.createdAt)]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          {job.isUrgent ? (
                            <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                              {t("common.urgent")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <Link to={`/job/${job.id}`} className="group mt-3 block">
                      <h2 className="text-lg font-bold text-gray-900 group-hover:text-[#0088FF] md:text-xl">
                        {pickListingTitle({ title: job.title, titleEn: job.titleEn }, locale, job.title)}
                      </h2>
                    </Link>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {job.isInternship ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                          {t("entryLevel.internship")}
                        </span>
                      ) : null}
                      {job.isBeginnerFriendly ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                          {t("entryLevel.beginnerFriendly")}
                        </span>
                      ) : null}
                      <span className={tagChipClass}>
                        {jobCategoryLabel(job, categories, locale)}
                      </span>
                      {jobSubcategoryLabel(job, subcategoryNamesById, locale) ? (
                        <span className={tagChipClass}>
                          {jobSubcategoryLabel(job, subcategoryNamesById, locale)}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-600">
                      {pickListingDescription(
                        { description: job.description, descriptionEn: job.descriptionEn },
                        locale,
                      )}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {job.skills.slice(0, 3).map((skill) => (
                        <span key={skill.id} className={tagChipClass}>
                          {skill.name}
                        </span>
                      ))}
                      {job.skills.length > 3 ? (
                        <span className={tagChipClass}>+{job.skills.length - 3}</span>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                      <span className="shrink-0 text-sm font-semibold text-gray-900">{budgetLabel(job)}</span>
                      <span className={metaPillClass}>
                        {locationIcon(job.locationType)} {locationLabelsLegacy[job.locationType] ?? job.locationType}
                      </span>
                      {job.applicationDeadline ? (
                        <span
                          className={`${metaPillClass} ${
                            isDeadlineSoon(job.applicationDeadline) ? "font-medium text-red-600" : ""
                          }`}
                        >
                          📅 {t("jobs.lastDeadline", { date: deadlineText(job.applicationDeadline) })}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-4">
                      <SaveBookmarkButton variant="icon" resourceType="job" resourceId={job.id} />
                      <Link
                        to={`/job/${job.id}`}
                        className="inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg bg-[#0088FF] px-4 text-sm font-semibold text-white transition hover:bg-[#006ACC] sm:flex-none sm:px-5"
                      >
                        {t("common.viewDetails")}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {jobsHasMore ? (
              <div className="mt-5">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void fetchNextPage()}
                  className="h-11 rounded-lg border border-[#0088FF] px-4 text-sm font-semibold text-[#0088FF] transition hover:bg-[#E8F4FF] disabled:opacity-60"
                >
                  {t("common.loadMore")}
                  </button>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  </>
  )
}
