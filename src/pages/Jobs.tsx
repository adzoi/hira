import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import SaveBookmarkButton from "../components/SaveBookmarkButton.tsx"
import EmptyState from "../components/ui/EmptyState.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import MarketplaceCatalogToolbar from "../components/MarketplaceCatalogToolbar.tsx"
import LocationFilterSelect from "../components/LocationFilterSelect.tsx"
import { fetchAllRowsByRange } from "../lib/supabaseFetchPaged.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { jobVacancyStats } from "../lib/jobVacancies.ts"
import { formatCityForDisplay, jobMatchesUnifiedLocation } from "../lib/marketplaceFilters.ts"
import { jobVipIsActive } from "../lib/vipJobTiers.ts"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import {
  catalogSelectionMatchesEntity,
  categoryChildrenOf,
  categoryRoots,
  effectiveCatalogFilterId,
  type CategoryBranchRow,
} from "../lib/marketplaceCategoryTree.ts"
import { ViewCountEyeIcon } from "../components/ViewCountEyeIcon.tsx"

type SortOption = "newest" | "budget_high" | "budget_low" | "applicants" | "deadline"
type BudgetType = "fixed" | "hourly" | "monthly"
type DurationType = "one_time" | "ongoing"

type JobItem = {
  id: string
  categoryId: string
  title: string
  description: string
  imagePath: string | null
  createdAt: string
  budgetType: string
  budgetMin: number | null
  budgetMax: number | null
  locationType: string
  durationType: string
  isUrgent: boolean
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

type CategoryItem = { id: string; name_ka: string; parent_id: string | null }

const mockJobs: JobItem[] = [
  {
    id: "1",
    categoryId: "mock-programming",
    title: "React Developer საჭიროა E-Commerce პროექტისთვის",
    companyName: "TechStart Georgia",
    city: "თბილისი",
    categoryName: "პროგრამირება",
    subcategoryName: null,
    subcategoryId: null,
    description:
      "გვჭირდება გამოცდილი React დეველოპერი ონლაინ მაღაზიის შესაქმნელად. პროექტი მოიცავს პროდუქტების გვერდს, კალათას და გადახდის სისტემას.",
    imagePath: null,
    budgetMin: 800,
    budgetMax: 1500,
    budgetType: "fixed",
    locationType: "remote",
    durationType: "one_time",
    isUrgent: true,
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
    companyName: "Startup Hub Tbilisi",
    city: "თბილისი",
    categoryName: "დიზაინი",
    subcategoryName: null,
    subcategoryId: null,
    description:
      "ვეძებთ კრეატიულ დიზაინერს ახალი ტექნოლოგიური სტარტაპის ვიზუალური იდენტობის შესაქმნელად. საჭიროა ლოგო, ფერთა პალიტრა და ბრენდბუქი.",
    imagePath: null,
    budgetMin: 300,
    budgetMax: 600,
    budgetType: "fixed",
    locationType: "anywhere",
    durationType: "one_time",
    isUrgent: false,
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
    companyName: "Café Leila",
    city: "თბილისი",
    categoryName: "მარკეტინგი",
    subcategoryName: null,
    subcategoryId: null,
    description:
      "კაფეს სოციალური მედიის მართვა Instagram და Facebook-ზე. კვირაში 3-4 პოსტი, სტორიები, კომენტარებზე პასუხი. ქართული და ინგლისური ენები.",
    imagePath: null,
    budgetMin: 400,
    budgetMax: 400,
    budgetType: "monthly",
    locationType: "tbilisi",
    durationType: "ongoing",
    isUrgent: false,
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
    companyName: "Georgian Tours Ltd",
    city: "თბილისი",
    categoryName: "წერა და თარგმანი",
    subcategoryName: null,
    subcategoryId: null,
    description:
      "80 გვერდიანი სატურისტო ვებსაიტის თარგმნა ინგლისურიდან ქართულზე. ტექსტი მოიცავს ტურების აღწერებს, ბლოგ პოსტებს და FAQ გვერდს.",
    imagePath: null,
    budgetMin: 200,
    budgetMax: 350,
    budgetType: "fixed",
    locationType: "remote",
    durationType: "one_time",
    isUrgent: true,
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
      description: String(row.description ?? ""),
      imagePath: imagePaths[0] ?? (row.image_path != null ? String(row.image_path) : null),
      createdAt: String(row.created_at ?? ""),
      budgetType: String(row.budget_type ?? ""),
      budgetMin: row.budget_min != null ? Number(row.budget_min) : null,
      budgetMax: row.budget_max != null ? Number(row.budget_max) : null,
      locationType: String(row.location_type ?? ""),
      durationType: String(row.duration_type ?? ""),
      isUrgent: Boolean(row.is_urgent),
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

export default function JobsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [jobsTotal, setJobsTotal] = useState(0)
  const [jobsNextOffset, setJobsNextOffset] = useState(0)
  const jobsNextOffsetRef = useRef(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [jobs, setJobs] = useState<JobItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [subcategoryParentById, setSubcategoryParentById] = useState<Map<string, string>>(() => new Map())
  const [subcategoryNamesById, setSubcategoryNamesById] = useState<Map<string, string>>(() => new Map())

  const [advancedDropdownOpen, setAdvancedDropdownOpen] = useState(false)
  const advancedDropdownRef = useRef<HTMLDivElement>(null)

  const [searchText, setSearchText] = useState("")
  const [filterRootCategoryId, setFilterRootCategoryId] = useState("")
  const [filterMidCategoryId, setFilterMidCategoryId] = useState("")
  const [filterSpecializationId, setFilterSpecializationId] = useState("")

  const [appliedBudgetTypes, setAppliedBudgetTypes] = useState<BudgetType[]>([])
  const [appliedBudgetMin, setAppliedBudgetMin] = useState("")
  const [appliedBudgetMax, setAppliedBudgetMax] = useState("")
  const [appliedDurations, setAppliedDurations] = useState<DurationType[]>([])
  const [appliedUrgentOnly, setAppliedUrgentOnly] = useState(false)
  const [appliedLocationFilter, setAppliedLocationFilter] = useState("")
  const [appliedSkillIds, setAppliedSkillIds] = useState<string[]>([])

  const [draftBudgetTypes, setDraftBudgetTypes] = useState<BudgetType[]>([])
  const [draftBudgetMin, setDraftBudgetMin] = useState("")
  const [draftBudgetMax, setDraftBudgetMax] = useState("")
  const [draftDurations, setDraftDurations] = useState<DurationType[]>([])
  const [draftUrgentOnly, setDraftUrgentOnly] = useState(false)
  const [draftLocationFilter, setDraftLocationFilter] = useState("")
  const [draftSkillIds, setDraftSkillIds] = useState<string[]>([])

  const [sortBy, setSortBy] = useState<SortOption>("newest")

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

  const jobsCategoryFilterSlot = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative inline-flex h-10 min-w-[8.5rem] max-w-[10.5rem] shrink-0 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-600">
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
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
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
      <label className="relative inline-flex h-10 min-w-[8.5rem] max-w-[10.5rem] shrink-0 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-600">
        <span className="pointer-events-none min-w-0 flex-1 truncate">ქვეკატეგორია</span>
        <span className="shrink-0 text-slate-400">▾</span>
        <select
          value={filterMidCategoryId}
          disabled={!filterRootCategoryId || categoryMidsList.length === 0}
          onChange={(event) => {
            setFilterMidCategoryId(event.target.value)
            setFilterSpecializationId("")
          }}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
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
      <label className="relative inline-flex h-10 min-w-[8.5rem] max-w-[11rem] shrink-0 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-600">
        <span className="pointer-events-none min-w-0 flex-1 truncate">სპეციალიზაცია</span>
        <span className="shrink-0 text-slate-400">▾</span>
        <select
          value={filterSpecializationId}
          disabled={!specializationParentCategoryId || specializationOptions.length === 0}
          onChange={(event) => setFilterSpecializationId(event.target.value)}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          aria-label="სპეციალიზაცია"
        >
          <option value="">
            {!specializationParentCategoryId
              ? "ჯერ ზემოთ"
              : specializationOptions.length === 0
                ? "არ არის"
                : "ყველა"}
          </option>
          {specializationOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name_ka}
            </option>
          ))}
        </select>
      </label>
    </div>
  )

  useEffect(() => {
    document.title = "სამუშაოები — გიგორი"
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

  const fetchJobsPage = useCallback(
    async (append: boolean) => {
      if (!isSupabaseConfigured || !supabase) {
        setJobs(mockJobs)
        setCategories([])
        setSubcategoryParentById(new Map())
        setSubcategoryNamesById(new Map())
        setJobsTotal(mockJobs.length)
        jobsNextOffsetRef.current = mockJobs.length
        setJobsNextOffset(mockJobs.length)
        setLoading(false)
        setLoadingMore(false)
        return
      }

      if (!append) {
        jobsNextOffsetRef.current = 0
        setJobsNextOffset(0)
        setLoading(true)
      } else {
        setLoadingMore(true)
      }
      setError("")
      try {
        const offset = append ? jobsNextOffsetRef.current : 0
        const page = Math.floor(offset / JOBS_PAGE_SIZE) + 1
        const category = serverCategoryForFetch
        const { data, error: fnErr } = await supabase.functions.invoke("get-jobs-page", {
          body: { category, page },
        })
        if (fnErr) throw fnErr
        if (!data || typeof data !== "object" || !("ok" in data) || (data as { ok?: unknown }).ok !== true) {
          const errMsg =
            data && typeof data === "object" && "error" in data
              ? String((data as { error?: unknown }).error)
              : "მონაცემები ვერ ჩაიტვირთა."
          throw new Error(errMsg)
        }

        const payload = (data as { data: unknown }).data as Record<string, unknown> | null
        const jobRows = Array.isArray(payload?.jobs) ? (payload.jobs as unknown[]) : []
        const categoryRows = Array.isArray(payload?.categories) ? (payload.categories as unknown[]) : []
        const totalRaw = payload?.total_count ?? payload?.total
        const total = Number(totalRaw)
        const safeTotal = Number.isFinite(total) ? total : 0

        const mappedJobs = mapRpcRowsToJobs(jobRows)

        if (!append) {
          setJobs(mappedJobs.length > 0 ? mappedJobs : mockJobs)
          jobsNextOffsetRef.current = JOBS_PAGE_SIZE
          setJobsNextOffset(JOBS_PAGE_SIZE)
        } else {
          setJobs((prev) => {
            const seen = new Set(prev.map((j) => j.id))
            const merged = [...prev]
            for (const j of mappedJobs) {
              if (!seen.has(j.id)) {
                seen.add(j.id)
                merged.push(j)
              }
            }
            return merged
          })
          jobsNextOffsetRef.current += JOBS_PAGE_SIZE
          setJobsNextOffset(jobsNextOffsetRef.current)
        }

        setJobsTotal(safeTotal)

        setCategories(
          categoryRows.map((c) => {
            const row = c as Record<string, unknown>
            return {
              id: String(row.id ?? ""),
              name_ka: String(row.name_ka ?? ""),
              parent_id: (row.parent_id as string | null | undefined) ?? null,
            }
          }) as CategoryItem[],
        )

        if (!append) {
          if (!supabase) return
          const subRows = await fetchAllRowsByRange((from, to) => {
            if (!supabase) return
            return supabase
              .from("subcategories")
              .select("id,name_ka,category_id")
              .eq("is_active", true)
              .order("name_ka")
              .range(from, to)
          })
          setSubcategoryNamesById(
            new Map(
              subRows.map((r) => {
                const row = r as { id?: string; name_ka?: string }
                return [String(row.id ?? ""), String(row.name_ka ?? "")] as const
              }),
            ),
          )
          setSubcategoryParentById(
            new Map(
              subRows.map((r) => {
                const row = r as { id?: string; category_id?: string | null }
                return [String(row.id ?? ""), String(row.category_id ?? "")] as const
              }),
            ),
          )
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "მონაცემები ვერ ჩაიტვირთა.")
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [serverCategoryForFetch],
  )

  // Edge function only receives category + page; budget/location/skill filters run client-side on `filteredJobs`.
  // Do not list applied* array state here — new array references each render would refetch endlessly.
  useEffect(() => {
    void fetchJobsPage(false)
  }, [serverCategoryForFetch, fetchJobsPage])

  const reloadJobsFirstPage = () => {
    void fetchJobsPage(false)
  }

  const loadMoreJobs = () => {
    void fetchJobsPage(true)
  }

  const jobsHasMore = jobsNextOffset < jobsTotal

  const budgetTypeLabels: Record<BudgetType, string> = {
    fixed: "ფიქსირებული",
    hourly: "საათობრივი",
    monthly: "თვიური",
  }

  const locationLabelsLegacy: Record<string, string> = {
    remote: "დისტანციური",
    tbilisi: "თბილისი",
    hybrid: "შერეული",
    anywhere: "ნებისმიერი",
  }

  const durationLabels: Record<DurationType, string> = {
    one_time: "ერთჯერადი",
    ongoing: "მიმდინარე",
  }

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
  }, [jobs])

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
    if (appliedLocationFilter.trim()) n += 1
    if (appliedSkillIds.length > 0) n += appliedSkillIds.length
    return n
  }, [
    appliedBudgetTypes,
    appliedBudgetMin,
    appliedBudgetMax,
    appliedDurations,
    appliedUrgentOnly,
    appliedLocationFilter,
    appliedSkillIds,
  ])

  const filteredJobs = useMemo(() => {
    const search = searchText.trim().toLowerCase()
    const minBudget = appliedBudgetMin ? Number(appliedBudgetMin) : null
    const maxBudget = appliedBudgetMax ? Number(appliedBudgetMax) : null

    return jobs.filter((job) => {
      const skillsBlob = job.skills.map((s) => s.name).join(" ").toLowerCase()
      const taxonomyBlob = `${job.categoryName} ${job.subcategoryName ?? ""}`.toLowerCase()
      const cityBlob = (job.city ?? "").toLowerCase()
      const matchesSearch =
        search.length === 0 ||
        job.title.toLowerCase().includes(search) ||
        job.description.toLowerCase().includes(search) ||
        skillsBlob.includes(search) ||
        taxonomyBlob.includes(search) ||
        (cityBlob.length > 0 && cityBlob.includes(search))
      if (!matchesSearch) return false

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
    searchText,
    catalogFilterEffectiveId,
    categories,
    subcategoryParentById,
    appliedBudgetTypes,
    appliedBudgetMin,
    appliedBudgetMax,
    appliedLocationFilter,
    appliedDurations,
    appliedUrgentOnly,
    appliedSkillIds,
  ])

  const sortedJobs = useMemo(() => {
    const list = [...filteredJobs]
    if (sortBy === "newest") {
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
  }, [filteredJobs, sortBy])

  const budgetLabel = (job: JobItem) => {
    const format = (value: number | null) => (value ?? 0).toLocaleString("en-US")
    if (job.budgetType === "hourly") return `₾${job.budgetMin ?? 0}/საათი`
    if (job.budgetType === "monthly") return `₾${format(job.budgetMin)}/თვე`
    return `₾${format(job.budgetMin)} - ₾${format(job.budgetMax)}`
  }

  const locationIcon = (type: string) => (type === "remote" ? "🌐" : "📍")

  /** Outlined pills: #D1D5DB border, ~2px×10px padding, body #374151 (matches meta + skill row) */
  const tagChipClass =
    "inline-flex items-center rounded-full border border-[#D1D5DB] bg-white px-2.5 py-0.5 text-xs font-medium text-[#374151]"
  const metaPillClass = tagChipClass

  return (
    <div className="min-h-screen bg-white page-enter">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-6 py-6 font-sans text-slate-600 md:px-8 md:py-8">
        <section className="p-1 md:p-0">
          <MarketplaceCatalogToolbar
            eyebrow=""
            title=""
            showPageHeader={false}
            searchValue={searchText}
            onSearchChange={setSearchText}
            searchPlaceholder="სათაური, აღწერა, უნარები, კატეგორია..."
            categorySlot={jobsCategoryFilterSlot}
            locationDisplay={appliedLocationFilter}
            sortValue={sortBy}
            onSortChange={(value) => setSortBy(value as SortOption)}
            sortOptions={[
              { value: "newest", label: "ახალი" },
              { value: "budget_high", label: "ბიუჯეტი: მაღალი" },
              { value: "budget_low", label: "ბიუჯეტი: დაბალი" },
              { value: "applicants", label: "განმცხადებლები" },
              { value: "deadline", label: "ვადა იწურება" },
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
                <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">ბიუჯეტის ტიპი</p>
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
                <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">ბიუჯეტის დიაპაზონი (₾)</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    value={draftBudgetMin}
                    onChange={(event) => setDraftBudgetMin(event.target.value)}
                    placeholder="მინ"
                    className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                  />
                  <input
                    type="number"
                    min={0}
                    value={draftBudgetMax}
                    onChange={(event) => setDraftBudgetMax(event.target.value)}
                    placeholder="მაქს"
                    className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                  />
                </div>
              </div>

              <label className="block pb-1">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">ლოკაცია</span>
                <LocationFilterSelect
                  value={draftLocationFilter}
                  onChange={setDraftLocationFilter}
                  className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                />
              </label>

              <div>
                <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">ხანგრძლივობა</p>
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
                <span>მხოლოდ გადაუდებელი</span>
                <input type="checkbox" checked={draftUrgentOnly} onChange={(event) => setDraftUrgentOnly(event.target.checked)} />
              </label>
            </>
            }
          />
        </section>

        {error ? (
          <div className="mt-6">
            <ErrorState message={error} onRetry={reloadJobsFirstPage} />
          </div>
        ) : loading ? (
          <div className="mt-6 space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonCard key={index} avatar lines={3} />
            ))}
          </div>
        ) : (
          <>
            <p className="mt-6 text-sm font-medium text-slate-600">მოიძებნა {sortedJobs.length} განცხადება</p>
            {sortedJobs.length === 0 ? (
              <div className="mt-6">
                <EmptyState message="განცხადებები ჯერ არ არის. იყავი პირველი!" actionLabel="ფილტრების გასუფთავება" onAction={clearFilters} />
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {sortedJobs.map((job) => (
                  <article
                    key={job.id}
                    className="relative flex w-full max-w-full flex-col rounded-2xl border border-slate-200/80 border-l-[3px] border-l-transparent bg-white p-4 shadow-sm transition-[border-left-color,box-shadow] duration-200 ease-out hover:border-l-[#0088FF] hover:shadow-[-4px_0_12px_rgba(0,136,255,0.25)]"
                  >
                    {job.vipActive ? (
                      <span className="absolute right-4 top-4 z-10 rounded-full bg-[#F59E0B] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                        VIP
                      </span>
                    ) : null}

                    <div className={`flex items-start gap-3 ${job.vipActive ? "pr-14" : ""}`}>
                      {job.companyAvatar ? (
                        <img
                          src={avatarImageUrl(supabase, job.companyAvatar) ?? job.companyAvatar}
                          alt={`${job.companyName} ავატარი`}
                          loading="lazy"
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
                            <p className="font-bold text-gray-900">{job.companyName}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {formatCityForDisplay(job.city) ?? job.city ?? "ქალაქი უცნობია"} • {formatRelativeTime(job.createdAt)}
                            </p>
                          </div>
                          {job.isUrgent ? (
                            <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                              გადაუდებელი
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <Link to={`/job/${job.id}`} className="group mt-3 block">
                      <h2 className="text-lg font-bold text-gray-900 group-hover:text-[#0088FF] md:text-xl">{job.title}</h2>
                    </Link>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={tagChipClass}>{job.categoryName}</span>
                      {job.subcategoryName ? <span className={tagChipClass}>{job.subcategoryName}</span> : null}
                    </div>

                    <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-600">{job.description}</p>

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
                        {durationLabels[(job.durationType as DurationType) ?? "one_time"] ?? job.durationType}
                      </span>
                      <span className={metaPillClass}>
                        {locationIcon(job.locationType)} {locationLabelsLegacy[job.locationType] ?? job.locationType}
                      </span>
                      <span className={metaPillClass}>
                        💼 {job.applicantsCount} განმცხადებელი
                      </span>
                      <span className={`${metaPillClass} gap-1`}>
                        <ViewCountEyeIcon className="h-3.5 w-3.5 shrink-0 text-[#374151]" />
                        {job.viewsCount} ნახვა
                      </span>
                      {job.vacancyFull ? (
                        <span className={`${metaPillClass} font-medium text-amber-800`}>დაკომლექტებული</span>
                      ) : (
                        <span className={metaPillClass}>
                          {job.vacancyRemaining} თავისუფალი ადგილი
                        </span>
                      )}
                      {job.applicationDeadline ? (
                        <span
                          className={`${metaPillClass} ${
                            isDeadlineSoon(job.applicationDeadline) ? "font-medium text-red-600" : ""
                          }`}
                        >
                          📅 ბოლო ვადა: {deadlineText(job.applicationDeadline)}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                      <SaveBookmarkButton variant="icon" resourceType="job" resourceId={job.id} />
                      <Link
                        to={`/job/${job.id}`}
                        className="inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg bg-[#0088FF] px-4 text-sm font-semibold text-white transition hover:bg-[#006ACC] sm:flex-none sm:px-5"
                      >
                        დეტალების ნახვა
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
                  onClick={loadMoreJobs}
                  className="h-11 rounded-lg border border-[#0088FF] px-4 text-sm font-semibold text-[#0088FF] transition hover:bg-[#E8F4FF] disabled:opacity-60"
                >
                  მეტის ჩატვირთვა
                </button>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}
