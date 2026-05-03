import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import EmptyState from "../components/ui/EmptyState.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { formatCityForDisplay, matchesLocationFilter } from "../lib/marketplaceFilters.ts"
import LocationFilterSelect from "../components/LocationFilterSelect.tsx"
import MarketplaceCatalogToolbar from "../components/MarketplaceCatalogToolbar.tsx"

type SortOption = "rating" | "price_asc" | "price_desc" | "newest" | "completed"
type Availability = "full_time" | "part_time" | "weekends"

type FreelancerCardItem = {
  id: string
  slug: string
  professionalTitle: string
  averageRating: number
  totalReviewsCount: number
  availability: string | null
  completedJobsCount: number
  createdAt: string
  fullName: string
  avatarUrl: string | null
  city: string | null
  bio: string | null
  skills: Array<{ id: string; name: string; categoryId: string | null }>
  services: Array<{ price: number; description: string | null }>
}

type CategoryItem = { id: string; name_ka: string }
type SkillItem = { id: string; name: string; category_id: string | null }

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

function getLowestService(services: Array<{ price: number; description: string | null }>) {
  if (services.length === 0) return null
  return services.reduce((lowest, current) => (current.price < lowest.price ? current : lowest), services[0])
}

function stripListingMeta(raw: string | null) {
  if (!raw) return null
  const prefix = "<!--gigori-meta:"
  const suffix = "-->"
  if (!raw.startsWith(prefix)) return raw
  const endIndex = raw.indexOf(suffix)
  if (endIndex < 0) return raw
  return raw.slice(endIndex + suffix.length).trimStart()
}

function ratingStars(value: number) {
  const rounded = Math.round(value)
  return `${"★".repeat(Math.max(0, rounded))}${"☆".repeat(Math.max(0, 5 - rounded))}`
}

export default function BrowsePage() {
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [advancedDropdownOpen, setAdvancedDropdownOpen] = useState(false)
  const advancedDropdownRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(20)
  const [freelancers, setFreelancers] = useState<FreelancerCardItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [sortBy, setSortBy] = useState<SortOption>("rating")

  const [searchText, setSearchText] = useState("")
  const [categoryId, setCategoryId] = useState("")
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

  useEffect(() => {
    document.title = "ფრილანსერები — გიგორი"
    return () => {
      document.title = "გიგორი"
    }
  }, [])

  const loadData = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setFreelancers(mockFreelancers)
      setCategories([])
      setSkills([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError("")
    try {
      const [freelancersRes, categoriesRes, skillsRes] = await Promise.all([
        supabase
          .from("freelancer_profiles")
          .select(`
            *,
            profiles:profiles!freelancer_profiles_user_id_fkey (full_name, avatar_url, city),
            freelancer_skills (
              skills (id, name, category_id)
            ),
            services (price, description)
          `)
          .eq("is_public", true)
          .order("average_rating", { ascending: false })
          .limit(20),
        supabase.from("categories").select("id,name_ka").eq("is_active", true).order("sort_order").limit(20),
        supabase.from("skills").select("id,name,category_id").eq("is_approved", true).order("name").limit(20),
      ])

      if (freelancersRes.error) throw freelancersRes.error
      if (categoriesRes.error) throw categoriesRes.error
      if (skillsRes.error) throw skillsRes.error

      const mapped: FreelancerCardItem[] = (freelancersRes.data ?? []).map((item: any) => {
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
        const ids = mapped.map((f) => f.id)
        const [{ data: cjRows, error: cjErr }, { data: siRows, error: siErr }] = await Promise.all([
          supabase.from("completed_jobs").select("freelancer_profile_id").in("freelancer_profile_id", ids),
          supabase
            .from("service_inquiries")
            .select("freelancer_profile_id")
            .eq("status", "completed")
            .in("freelancer_profile_id", ids),
        ])

        const countMap: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]))

        if (!cjErr && cjRows) {
          for (const row of cjRows) {
            const fp = row.freelancer_profile_id
            countMap[fp] = (countMap[fp] ?? 0) + 1
          }
        } else {
          for (const m of mapped) {
            countMap[m.id] = Number(m.completedJobsCount ?? 0)
          }
        }

        if (!siErr && siRows) {
          for (const row of siRows) {
            const fp = row.freelancer_profile_id
            countMap[fp] = (countMap[fp] ?? 0) + 1
          }
        }

        for (const item of mapped) {
          item.completedJobsCount = countMap[item.id] ?? 0
        }
      }

      setFreelancers(mapped.length > 0 ? mapped : mockFreelancers)
      setCategories((categoriesRes.data ?? []) as CategoryItem[])
      setSkills((skillsRes.data ?? []) as SkillItem[])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "მონაცემები ვერ ჩაიტვირთა.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const query = searchParams.get("q")
    const category = searchParams.get("category")
    if (query) setSearchText(query)
    if (category) setCategoryId(category)
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

  const topSkills = useMemo(() => {
    const countBySkillId = freelancers.reduce<Record<string, number>>((acc, freelancer) => {
      freelancer.skills.forEach((skill) => {
        acc[skill.id] = (acc[skill.id] ?? 0) + 1
      })
      return acc
    }, {})

    return [...skills]
      .sort((a, b) => (countBySkillId[b.id] ?? 0) - (countBySkillId[a.id] ?? 0))
      .slice(0, 15)
  }, [freelancers, skills])

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
    setSortBy("rating")
    setVisibleCount(20)
  }

  const filteredFreelancers = useMemo(() => {
    const search = searchText.trim().toLowerCase()
    const minPriceNumber = minPrice ? Number(minPrice) : null
    const maxPriceNumber = maxPrice ? Number(maxPrice) : null

    return freelancers.filter((freelancer) => {
      const skillNames = freelancer.skills.map((skill) => skill.name.toLowerCase())
      const hasSearchMatch =
        search.length === 0 ||
        freelancer.fullName.toLowerCase().includes(search) ||
        skillNames.some((name) => name.includes(search))
      if (!hasSearchMatch) return false

      const hasCategoryMatch =
        !categoryId || freelancer.skills.some((skill) => skill.categoryId === categoryId)
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

      const lowestService = getLowestService(freelancer.services)
      const lowestPrice = lowestService?.price ?? null
      if (minPriceNumber !== null && (lowestPrice === null || lowestPrice < minPriceNumber)) return false
      if (maxPriceNumber !== null && (lowestPrice === null || lowestPrice > maxPriceNumber)) return false

      if (!matchesLocationFilter(freelancer, locationFilter)) return false

      return true
    })
  }, [
    freelancers,
    searchText,
    categoryId,
    selectedSkillIds,
    availabilityFilters,
    minimumRating,
    minPrice,
    maxPrice,
    locationFilter,
  ])

  const sortedFreelancers = useMemo(() => {
    const list = [...filteredFreelancers]
    if (sortBy === "rating") {
      return list.sort((a, b) => b.averageRating - a.averageRating)
    }
    if (sortBy === "price_asc") {
      return list.sort((a, b) => {
        const aPrice = getLowestService(a.services)?.price ?? Number.MAX_SAFE_INTEGER
        const bPrice = getLowestService(b.services)?.price ?? Number.MAX_SAFE_INTEGER
        return aPrice - bPrice
      })
    }
    if (sortBy === "price_desc") {
      return list.sort((a, b) => {
        const aPrice = getLowestService(a.services)?.price ?? -1
        const bPrice = getLowestService(b.services)?.price ?? -1
        return bPrice - aPrice
      })
    }
    if (sortBy === "newest") {
      return list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    }
    return list.sort((a, b) => b.completedJobsCount - a.completedJobsCount)
  }, [filteredFreelancers, sortBy])

  const availabilityLabel: Record<Availability, string> = {
    full_time: "სრული განაკვეთი",
    part_time: "ნახევარი განაკვეთი",
    weekends: "შაბათ-კვირა",
  }
  const availabilityBadgeClass: Record<Availability, string> = {
    full_time: "bg-green-100 text-green-700",
    part_time: "bg-blue-100 text-blue-700",
    weekends: "bg-orange-100 text-orange-700",
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
    <div className="min-h-screen bg-[#F8F9FC] page-enter">
      <Navbar />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
        <MarketplaceCatalogToolbar
          eyebrow="კატალოგი"
          title="ფრილანსერები"
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="სახელი ან უნარი (მაგ. React, ნინო)..."
          categories={categories}
          categoryId={categoryId}
          onCategoryChange={setCategoryId}
          sortValue={sortBy}
          onSortChange={(value) => setSortBy(value as SortOption)}
          sortOptions={[
            { value: "rating", label: "რეიტინგი" },
            { value: "price_asc", label: "ფასი: იაფიდან" },
            { value: "price_desc", label: "ფასი: ძვირიდან" },
            { value: "newest", label: "ახალი" },
            { value: "completed", label: "შესრულებული სამუშაო" },
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
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">მინ. რეიტინგი</span>
                <select
                  value={draftMinRating}
                  onChange={(event) => setDraftMinRating(Number(event.target.value) as 0 | 3 | 4 | 5)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                >
                  <option value={0}>ნებისმიერი</option>
                  <option value={3}>3+ ვარსკვლავი</option>
                  <option value={4}>4+ ვარსკვლავი</option>
                  <option value={5}>5 ვარსკვლავი</option>
                </select>
              </label>

              <div>
                <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">ფასის დიაპაზონი (₾)</p>
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

        <section className="mt-8 min-w-0">
          {error ? (
            <ErrorState message={error} onRetry={loadData} />
          ) : loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonCard key={`skeleton-${index}`} avatar lines={4} />
              ))}
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-slate-600">ნაპოვნია {sortedFreelancers.length} ფრილანსერი</p>

              {sortedFreelancers.length === 0 ? (
                <EmptyState
                  message="ფრილანსერები ჯერ არ არიან. მალე დაემატება!"
                  actionLabel="ფილტრების გასუფთავება"
                  onAction={clearFilters}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {sortedFreelancers.slice(0, visibleCount).map((freelancer) => {
                    const lowestService = getLowestService(freelancer.services)
                    const negotiable = lowestService ? isServiceNegotiable(lowestService) : true
                    const availabilityText =
                      freelancer.availability && availabilityLabel[freelancer.availability as Availability]
                        ? availabilityLabel[freelancer.availability as Availability]
                        : "შეთანხმებით"

                    return (
                      <Link
                        key={freelancer.id}
                        to={`/freelancer/${freelancer.slug}`}
                        className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="flex items-start gap-3">
                          {freelancer.avatarUrl ? (
                            <img
                              src={freelancer.avatarUrl}
                              alt={`${freelancer.fullName} ავატარი`}
                              loading="lazy"
                              className="h-16 w-16 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1B2B4B] text-lg font-bold text-white">
                              {getInitials(freelancer.fullName)}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-lg font-bold text-[#1B2B4B]">{freelancer.fullName}</p>
                            <p className="truncate text-sm text-slate-500">{freelancer.professionalTitle}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              📍 {formatCityForDisplay(freelancer.city) ?? "ქალაქი უცნობია"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between text-sm">
                          <p className="font-semibold text-[#D4A843]">
                            {ratingStars(freelancer.averageRating)} {freelancer.averageRating.toFixed(1)}
                          </p>
                          <p className="text-slate-500">({freelancer.totalReviewsCount} შეფასება)</p>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {freelancer.skills.slice(0, 3).map((skill) => (
                            <span
                              key={`${freelancer.id}-${skill.id}`}
                              className="rounded-full border border-[#D4A843] px-2 py-1 text-xs font-medium text-[#1B2B4B]"
                            >
                              {skill.name}
                            </span>
                          ))}
                          {freelancer.skills.length > 3 ? (
                            <span className="rounded-full border border-[#D4A843] px-2 py-1 text-xs font-medium text-[#1B2B4B]">
                              +{freelancer.skills.length - 3}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <p className="text-sm font-semibold text-[#1B2B4B]">
                            {lowestService
                              ? negotiable
                                ? "შეთანხმებით"
                                : `დან ₾${lowestService.price}`
                              : "ფასი შეთანხმებით"}
                          </p>
                          <span
                            className={`rounded-full px-2 py-1 text-xs ${
                              freelancer.availability && availabilityBadgeClass[freelancer.availability as Availability]
                                ? availabilityBadgeClass[freelancer.availability as Availability]
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {availabilityText}
                          </span>
                        </div>

                        <p className="mt-2 text-xs text-slate-500">💼 {freelancer.completedJobsCount} შესრულებული</p>

                        <span className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#1B2B4B] px-4 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B]">
                          პროფილის ნახვა
                        </span>
                      </Link>
                    )
                  })}
                </div>
              )}
              {visibleCount < sortedFreelancers.length ? (
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
        </section>
      </main>
    </div>
  )
}
