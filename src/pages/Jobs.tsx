import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import EmptyState from "../components/ui/EmptyState.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import MarketplaceCatalogToolbar from "../components/MarketplaceCatalogToolbar.tsx"
import LocationFilterSelect from "../components/LocationFilterSelect.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { jobMatchesUnifiedLocation } from "../lib/marketplaceFilters.ts"

type SortOption = "newest" | "budget_high" | "budget_low" | "applicants" | "deadline"
type BudgetType = "fixed" | "hourly" | "monthly"
type DurationType = "one_time" | "ongoing"

type JobItem = {
  id: string
  categoryId: string
  title: string
  description: string
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
  companyName: string
  companyAvatar: string | null
  city: string | null
  skills: Array<{ id: string; name: string }>
  applicantsCount: number
}

type CategoryItem = { id: string; name_ka: string }

const mockJobs: JobItem[] = [
  {
    id: "1",
    categoryId: "mock-programming",
    title: "React Developer საჭიროა E-Commerce პროექტისთვის",
    companyName: "TechStart Georgia",
    city: "თბილისი",
    categoryName: "პროგრამირება",
    subcategoryName: null,
    description:
      "გვჭირდება გამოცდილი React დეველოპერი ონლაინ მაღაზიის შესაქმნელად. პროექტი მოიცავს პროდუქტების გვერდს, კალათას და გადახდის სისტემას.",
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
    description:
      "ვეძებთ კრეატიულ დიზაინერს ახალი ტექნოლოგიური სტარტაპის ვიზუალური იდენტობის შესაქმნელად. საჭიროა ლოგო, ფერთა პალიტრა და ბრენდბუქი.",
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
    description:
      "კაფეს სოციალური მედიის მართვა Instagram და Facebook-ზე. კვირაში 3-4 პოსტი, სტორიები, კომენტარებზე პასუხი. ქართული და ინგლისური ენები.",
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
    description:
      "80 გვერდიანი სატურისტო ვებსაიტის თარგმნა ინგლისურიდან ქართულზე. ტექსტი მოიცავს ტურების აღწერებს, ბლოგ პოსტებს და FAQ გვერდს.",
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

export default function JobsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [visibleCount, setVisibleCount] = useState(20)
  const [jobs, setJobs] = useState<JobItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])

  const [advancedDropdownOpen, setAdvancedDropdownOpen] = useState(false)
  const advancedDropdownRef = useRef<HTMLDivElement>(null)

  const [searchText, setSearchText] = useState("")
  const [categoryId, setCategoryId] = useState("")

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

  const loadData = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setJobs(mockJobs)
      setCategories([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError("")
    try {
      const [jobsRes, categoriesRes] = await Promise.all([
        supabase
          .from("jobs")
          .select(`
            *,
            categories (name_ka),
            subcategories (name_ka),
            hirer_profiles (
              company_name,
              profiles:profiles!hirer_profiles_user_id_fkey (full_name, avatar_url, city)
            ),
            job_skills (
              skills (id, name)
            ),
            job_applications (id)
          `)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(120),
        supabase.from("categories").select("id,name_ka").eq("is_active", true).order("sort_order").limit(50),
      ])

      if (jobsRes.error) throw jobsRes.error
      if (categoriesRes.error) throw categoriesRes.error

      const mappedJobs: JobItem[] = (jobsRes.data ?? []).map((row: any) => {
        const skills =
          row.job_skills
            ?.map((item: any) => item.skills)
            .filter(Boolean)
            .map((skill: any) => ({ id: skill.id, name: skill.name })) ?? []

        const hirerProfile = row.hirer_profiles
        const profile = hirerProfile?.profiles
        const companyName = hirerProfile?.company_name || profile?.full_name || "დამქირავებელი"

        return {
          id: row.id,
          categoryId: row.category_id,
          title: row.title,
          description: row.description,
          createdAt: row.created_at,
          budgetType: row.budget_type,
          budgetMin: row.budget_min,
          budgetMax: row.budget_max,
          locationType: row.location_type,
          durationType: row.duration_type,
          isUrgent: row.is_urgent,
          applicationDeadline: row.application_deadline,
          categoryName: row.categories?.name_ka ?? "კატეგორია",
          subcategoryName: row.subcategories?.name_ka ?? null,
          companyName,
          companyAvatar: profile?.avatar_url ?? null,
          city: profile?.city ?? null,
          skills,
          applicantsCount: row.job_applications?.length ?? 0,
        }
      })

      setJobs(mappedJobs.length > 0 ? mappedJobs : mockJobs)
      setCategories((categoriesRes.data ?? []) as CategoryItem[])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "მონაცემები ვერ ჩაიტვირთა.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

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
    setCategoryId("")
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
    setVisibleCount(20)
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
      const matchesSearch =
        search.length === 0 ||
        job.title.toLowerCase().includes(search) ||
        job.description.toLowerCase().includes(search) ||
        job.companyName.toLowerCase().includes(search)
      if (!matchesSearch) return false

      if (categoryId && job.categoryId !== categoryId) return false

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
    categoryId,
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
      return list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
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

  return (
    <div className="min-h-screen bg-[#F8F9FC] page-enter">
      <Navbar />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
        <MarketplaceCatalogToolbar
          eyebrow="მარკეტპლეისი"
          title="სამუშაოები"
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="სათაური, აღწერა, კომპანია..."
          categories={categories}
          categoryId={categoryId}
          onCategoryChange={setCategoryId}
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
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">ლოკაცია / ქალაქი</span>
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

        {error ? (
          <div className="mt-6">
            <ErrorState message={error} onRetry={loadData} />
          </div>
        ) : loading ? (
          <div className="mt-6 space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonCard key={index} avatar lines={3} />
            ))}
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-slate-600">ნაპოვნია {sortedJobs.length} განცხადება</p>
            {sortedJobs.length === 0 ? (
              <div className="mt-6">
                <EmptyState message="განცხადებები ჯერ არ არის. იყავი პირველი!" actionLabel="ფილტრების გასუფთავება" onAction={clearFilters} />
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {sortedJobs.slice(0, visibleCount).map((job) => (
                  <article
                    key={job.id}
                    className="rounded-2xl border-l-4 border-l-transparent border-slate-200 bg-white p-4 shadow-sm transition hover:border-l-[#D4A843] hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {job.companyAvatar ? (
                          <img src={job.companyAvatar} alt={`${job.companyName} ავატარი`} loading="lazy" className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1B2B4B] text-xs font-bold text-white">
                            {getInitials(job.companyName)}
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-[#1B2B4B]">{job.companyName}</p>
                          <p className="text-xs text-slate-500">
                            {job.city ?? "ქალაქი უცნობია"} • {formatRelativeTime(job.createdAt)}
                          </p>
                        </div>
                      </div>
                      {job.isUrgent ? <span className="rounded-full bg-red-500 px-2 py-1 text-xs font-semibold text-white">გადაუდებელი</span> : null}
                    </div>

                    <Link to={`/job/${job.id}`} className="mt-3 block text-xl font-bold text-[#1B2B4B] hover:underline md:text-2xl">
                      {job.title}
                    </Link>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-[#D4A843] px-2 py-1 text-xs font-medium text-[#1B2B4B]">{job.categoryName}</span>
                      {job.subcategoryName ? (
                        <span className="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-600">{job.subcategoryName}</span>
                      ) : null}
                    </div>

                    <p className="mt-3 text-sm text-slate-700">
                      {job.description.length > 120 ? `${job.description.slice(0, 120)}...` : job.description}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {job.skills.slice(0, 3).map((skill) => (
                        <span key={skill.id} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          {skill.name}
                        </span>
                      ))}
                      {job.skills.length > 3 ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">+{job.skills.length - 3}</span>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-[#1B2B4B]">{budgetLabel(job)}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-1">
                        {durationLabels[(job.durationType as DurationType) ?? "one_time"] ?? job.durationType}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-1">
                        {locationIcon(job.locationType)} {locationLabelsLegacy[job.locationType] ?? job.locationType}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-1">{job.applicantsCount} განმცხადებელი</span>
                      {job.applicationDeadline ? (
                        <span
                          className={`rounded-full px-2 py-1 ${isDeadlineSoon(job.applicationDeadline) ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"}`}
                        >
                          ბოლო ვადა: {deadlineText(job.applicationDeadline)}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4">
                      <Link
                        to={`/job/${job.id}`}
                        className="ml-auto inline-flex h-10 items-center justify-center rounded-lg bg-[#1B2B4B] px-4 text-sm font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]"
                      >
                        დეტალების ნახვა
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {visibleCount < sortedJobs.length ? (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + 20)}
                  className="h-11 rounded-lg border border-[#1B2B4B] px-4 text-sm font-semibold text-[#1B2B4B]"
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
