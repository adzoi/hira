import { useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { OptimizedImage } from "../components/OptimizedImage.tsx"
import EmptyState from "../components/ui/EmptyState.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import LocationFilterSelect from "../components/LocationFilterSelect.tsx"
import MarketplaceCatalogToolbar, { marketplaceFilterPillClass } from "../components/MarketplaceCatalogToolbar.tsx"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { fetchAllRowsByRange } from "../lib/supabaseFetchPaged.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { usePageMeta } from "../lib/usePageMeta.tsx"
import { formatCityForDisplay, formatIndustryForDisplay, matchesLocationFilter } from "../lib/marketplaceFilters.ts"
import { normalizeSearchInput, safeExternalHref } from "../lib/validation.ts"
import { matchesSearch } from "../lib/searchTranslit.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"

type HirerRow = {
  id: string
  ownerUserId: string
  companyName: string
  industry: string | null
  description: string | null
  websiteUrl: string | null
  jobsPosted: number
  completedJobs: number
  averageRating: number
  ratingCount: number
  contactName: string
  avatarUrl: string | null
  city: string | null
  createdAt: string
}

type RawHirerRow = {
  id: string
  user_id: string
  company_name: string | null
  description: string | null
  industry: string | null
  website_url: string | null
  jobs_posted_count: number | null
  completed_jobs_count: number | null
  created_at: string
  profiles: {
    full_name: string | null
    avatar_url: string | null
    city: string | null
  } | null
}

type IndustryOption = { id: string; name_ka: string }

type SortOption = "jobs_desc" | "completed_desc" | "newest"

function companyInitials(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return "კო"
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
  }
  const only = parts[0] ?? "კ"
  return only.slice(0, 2).toUpperCase()
}

function ExternalLinkArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 17L17 7M17 7H10M17 7V14" />
    </svg>
  )
}

const mockHirers: HirerRow[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    ownerUserId: "00000000-0000-0000-0000-000000000011",
    companyName: "TechStart Georgia",
    industry: "ტექნოლოგია",
    description: "პარალელური პროდუქტის გუნდი თბილისიდან - ვახერხებთ ვებ და მობაილ შეკვეთებს.",
    websiteUrl: null,
    jobsPosted: 4,
    completedJobs: 12,
    averageRating: 4.7,
    ratingCount: 9,
    contactName: "ლაშა რ.",
    avatarUrl: null,
    city: "თბილისი",
    createdAt: new Date().toISOString(),
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    ownerUserId: "00000000-0000-0000-0000-000000000012",
    companyName: "Café Leila",
    industry: "სტუმართმოყვარეობა",
    description: "ოჯახური რესტორნის ბრენდი - ხშირად გვესაჭიროება მარკეტინგი და შინაარსი.",
    websiteUrl: null,
    jobsPosted: 8,
    completedJobs: 20,
    averageRating: 4.9,
    ratingCount: 15,
    contactName: "მარიამი ხ.",
    avatarUrl: null,
    city: "ბათუმი",
    createdAt: new Date().toISOString(),
  },
]

const HIRERS_PAGE_SIZE = 24

type HirersPageResult = {
  hirers: HirerRow[]
  total: number
}

async function loadHirerIndustries(): Promise<IndustryOption[]> {
  if (!isSupabaseConfigured || !supabase) {
    const names = new Set<string>()
    for (const h of mockHirers) {
      const raw = h.industry?.trim()
      if (raw) names.add(raw)
    }
    return [...names].sort((a, b) => a.localeCompare(b, "ka")).map((name) => ({ id: name, name_ka: name }))
  }

  const sb = supabase
  try {
    const rows = await fetchAllRowsByRange((from, to) =>
      sb
        .from("hirer_profiles")
        .select("industry")
        .not("industry", "is", null)
        .order("industry", { ascending: true })
        .range(from, to) as unknown,
    )
    const names = new Set<string>()
    for (const r of rows) {
      const t = String((r as { industry?: string | null }).industry ?? "").trim()
      if (t) names.add(t)
    }
    return [...names].sort((a, b) => a.localeCompare(b, "ka")).map((name) => ({ id: name, name_ka: name }))
  } catch {
    return []
  }
}

async function loadHirersPage(offset: number): Promise<HirersPageResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { hirers: mockHirers, total: mockHirers.length }
  }

  const { data, error: qErr, count } = await supabase
    .from("hirer_profiles")
    .select(
      `
            id,
            user_id,
            company_name,
            description,
            industry,
            website_url,
            jobs_posted_count,
            completed_jobs_count,
            created_at,
            profiles:profiles!hirer_profiles_user_id_fkey (
              full_name,
              avatar_url,
              city
            )
          `,
      { count: "exact" },
    )
    .order("jobs_posted_count", { ascending: false })
    .range(offset, offset + HIRERS_PAGE_SIZE - 1)

  if (qErr) throw qErr

  const mapped: HirerRow[] = (data ?? []).map((row: RawHirerRow) => {
    const profile = row.profiles
    const company = row.company_name?.trim() || "დამქირავებელი"
    return {
      id: row.id,
      ownerUserId: row.user_id,
      companyName: company,
      industry: row.industry ?? null,
      description: row.description ?? null,
      websiteUrl: row.website_url ?? null,
      jobsPosted: Number(row.jobs_posted_count ?? 0),
      completedJobs: Number(row.completed_jobs_count ?? 0),
      averageRating: 0,
      ratingCount: 0,
      contactName: profile?.full_name?.trim() || "საკონტაქტო პირი",
      avatarUrl: profile?.avatar_url ?? null,
      city: profile?.city ?? null,
      createdAt: row.created_at ?? new Date().toISOString(),
    }
  })

  if (mapped.length > 0) {
    const ids = mapped.map((h) => h.id)
    const ownerIds = Array.from(new Set(mapped.map((h) => h.ownerUserId).filter(Boolean)))
    const ownerToHirerId = mapped.reduce<Record<string, string>>((acc, h) => {
      if (h.ownerUserId) acc[h.ownerUserId] = h.id
      return acc
    }, {})

    const reviewQuery =
      ownerIds.length > 0
        ? supabase.from("reviews").select("reviewee_id, rating_overall").in("reviewee_id", ownerIds)
        : Promise.resolve({
            data: [] as { reviewee_id: string | null; rating_overall: number | null }[],
            error: null,
          })

    const [
      { data: cjRows, error: cjErr },
      { data: siRows, error: siErr },
      { data: reviewRows, error: reviewErr },
    ] = await Promise.all([
      supabase.from("completed_jobs").select("hirer_profile_id").in("hirer_profile_id", ids),
      supabase
        .from("service_inquiries")
        .select("hirer_profile_id")
        .eq("status", "completed")
        .in("hirer_profile_id", ids),
      reviewQuery,
    ])

    const countMap: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]))
    const ratingSumMap: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]))
    const ratingCountMap: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]))

    if (!cjErr && cjRows) {
      for (const row of cjRows) {
        const hp = row.hirer_profile_id
        countMap[hp] = (countMap[hp] ?? 0) + 1
      }
    } else {
      for (const m of mapped) {
        countMap[m.id] = Number(m.completedJobs ?? 0)
      }
    }

    if (!siErr && siRows) {
      for (const row of siRows) {
        const hp = row.hirer_profile_id
        countMap[hp] = (countMap[hp] ?? 0) + 1
      }
    }
    if (!reviewErr && reviewRows) {
      for (const row of reviewRows) {
        const hp = ownerToHirerId[String(row.reviewee_id ?? "")]
        const rating = Number(row.rating_overall ?? 0)
        if (!hp || !Number.isFinite(rating) || rating <= 0) continue
        ratingSumMap[hp] = (ratingSumMap[hp] ?? 0) + rating
        ratingCountMap[hp] = (ratingCountMap[hp] ?? 0) + 1
      }
    }

    for (const item of mapped) {
      item.completedJobs = countMap[item.id] ?? 0
      const reviewCount = ratingCountMap[item.id] ?? 0
      item.ratingCount = reviewCount
      item.averageRating = reviewCount > 0 ? (ratingSumMap[item.id] ?? 0) / reviewCount : 0
    }
  }

  return { hirers: mapped, total: count ?? 0 }
}

export default function HirersPage() {
  const { t } = useTranslation()
  const { data: industryOptions = [] } = useQuery({
    queryKey: queryKeys.hirerIndustries,
    queryFn: loadHirerIndustries,
  })

  const {
    data: hirersData,
    isLoading: loading,
    isError,
    error: hirersError,
    fetchNextPage,
    hasNextPage: hirersHasMore,
    isFetchingNextPage: hirersLoadingMore,
    refetch,
  } = useInfiniteQuery({
    queryKey: queryKeys.hirers,
    queryFn: ({ pageParam }) => loadHirersPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const nextOffset = lastPageParam + HIRERS_PAGE_SIZE
      if (nextOffset < lastPage.total) return nextOffset
      return undefined
    },
  })

  const error = isError
    ? queryErrorMessage(hirersError, "დამქირავებლების ჩამონათვალის წაკითხვა ვერ მოხერხდა.")
    : ""

  const hirers = useMemo(() => {
    const seen = new Set<string>()
    const merged: HirerRow[] = []
    for (const page of hirersData?.pages ?? []) {
      for (const h of page.hirers) {
        if (!seen.has(h.id)) {
          seen.add(h.id)
          merged.push(h)
        }
      }
    }
    return merged
  }, [hirersData?.pages])

  const [searchText, setSearchText] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("jobs_desc")

  const [advancedDropdownOpen, setAdvancedDropdownOpen] = useState(false)
  const advancedDropdownRef = useRef<HTMLDivElement>(null)

  const [locationFilter, setLocationFilter] = useState("")
  const [draftLocationFilter, setDraftLocationFilter] = useState("")
  const [avatarPreview, setAvatarPreview] = useState<{ companyName: string; avatarUrl: string | null } | null>(null)
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
    setDraftLocationFilter(locationFilter)
    setAdvancedDropdownOpen(true)
  }

  const saveAdvancedFilters = () => {
    setLocationFilter(draftLocationFilter)
    setAdvancedDropdownOpen(false)
  }

  const clearDraftAdvanced = () => {
    setDraftLocationFilter("")
  }

  const clearFilters = () => {
    setSearchText("")
    setCategoryId("")
    setLocationFilter("")
    setDraftLocationFilter("")
    setAdvancedDropdownOpen(false)
    setSortBy("jobs_desc")
  }

  const advancedFilterCount = locationFilter.trim() ? 1 : 0

  const filtered = useMemo(() => {
    const q = searchText.trim()
    return hirers.filter((h) => {
      if (categoryId && (h.industry?.trim() || "") !== categoryId) return false

      const desc = (h.description ?? "").trim()
      if (
        !matchesLocationFilter(
          {
            city: h.city,
            bio: desc,
            professionalTitle: `${h.companyName} ${h.contactName} ${h.industry ?? ""}`.trim(),
          },
          locationFilter,
        )
      ) {
        return false
      }

      if (!q) return true
      return matchesSearch(q, h.contactName, h.companyName)
    })
  }, [hirers, searchText, categoryId, locationFilter])

  const sorted = useMemo(() => {
    const list = [...filtered]
    if (sortBy === "completed_desc") {
      return list.sort((a, b) => b.completedJobs - a.completedJobs)
    }
    if (sortBy === "newest") {
      return list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    }
    return list.sort((a, b) => b.jobsPosted - a.jobsPosted)
  }, [filtered, sortBy])

  const pageMeta = usePageMeta(t("hirers.title"), t("hirers.metaDescription"))

  if (loading) {
    return (
      <div className="min-h-screen bg-white page-enter">
        <main className="mx-auto w-full max-w-7xl px-6 py-6 font-sans text-slate-600 md:px-8 md:py-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} avatar lines={4} />
            ))}
          </div>
        </main>
      </div>
    )
  }

  const websiteChipClass =
    "inline-flex items-center gap-1 rounded-full border border-[#D1D5DB] bg-white px-2.5 py-1 text-xs font-medium text-[#374151]"

  const hirersCategoryFilterSlot = (
    <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:items-center sm:gap-1.5">
      <label className={`${marketplaceFilterPillClass} min-w-0 sm:shrink-0`}>
        <span className="pointer-events-none min-w-0 flex-1 truncate">{t("hirers.industry")}</span>
        <span className="shrink-0 text-slate-400">▾</span>
        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={t("hirers.industry")}
        >
          <option value="">{t("common.allIndustries")}</option>
          {industryOptions.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {formatIndustryForDisplay(cat.name_ka) ?? cat.name_ka}
            </option>
          ))}
        </select>
      </label>

      <label className={`${marketplaceFilterPillClass} min-w-0 sm:min-w-[10.5rem] sm:max-w-[14rem] sm:shrink-0`}>
        <span className="pointer-events-none min-w-0 flex-1 truncate">
          {locationFilter.trim() ? formatCityForDisplay(locationFilter) ?? locationFilter : t("common.locationCity")}
        </span>
        <span className="shrink-0 text-slate-400">▾</span>
        <LocationFilterSelect
          value={locationFilter}
          onChange={setLocationFilter}
          className="absolute inset-0 z-10 h-full w-full min-h-[2.5rem] min-w-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  )

  return (
    <>
      {pageMeta}
    <div className="min-h-screen bg-white page-enter">
      <main className="mx-auto w-full max-w-7xl px-6 py-6 font-sans text-slate-600 md:px-8 md:py-8">
        <section className="p-1 md:p-0">
          <MarketplaceCatalogToolbar
            eyebrow=""
            title=""
            showPageHeader={false}
            searchValue={searchText}
            onSearchChange={(value) => setSearchText(normalizeSearchInput(value))}
            searchPlaceholder={t("hirers.searchPlaceholder")}
            categorySlot={hirersCategoryFilterSlot}
            sortValue={sortBy}
            onSortChange={(value) => setSortBy(value as SortOption)}
            sortOptions={[
              { value: "jobs_desc", label: t("common.sortJobsCount") },
              { value: "completed_desc", label: t("common.completedJobsSort") },
              { value: "newest", label: t("common.sortNewRegistration") },
            ]}
            advancedDropdownOpen={advancedDropdownOpen}
            advancedFilterCount={advancedFilterCount}
            onToggleAdvanced={openAdvancedDropdown}
            advancedDropdownRef={advancedDropdownRef}
            onDismissAdvanced={() => setAdvancedDropdownOpen(false)}
            onSaveAdvanced={saveAdvancedFilters}
            onClearDraftAdvanced={clearDraftAdvanced}
            childrenAdvancedBody={
              <label className="block pb-1">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("common.locationCity")}</span>
                <LocationFilterSelect
                  value={draftLocationFilter}
                  onChange={setDraftLocationFilter}
                  className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                />
              </label>
            }
          />
        </section>

        <section className="mt-6 min-w-0">
          <p className="text-sm font-medium text-slate-600">{t("hirers.found", { count: sorted.length })}</p>

          {error ? <ErrorState message={error} onRetry={() => void refetch()} /> : null}

          {!error && sorted.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                message={t("hirers.empty")}
                actionLabel={t("common.clearFilters")}
                onAction={clearFilters}
              />
            </div>
          ) : (
            <>
              {!error ? (
                <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {sorted.map((h) => {
                    const desc = (h.description ?? "").trim()
                    const snippet =
                      desc.length > 160 ? `${desc.slice(0, 160)}…` : desc || t("common.companySnippetFallback")
                    return (
                      <li
                        key={h.id}
                        className="flex h-full flex-col rounded-2xl border border-slate-200/80 border-l-[3px] border-l-transparent bg-white p-4 shadow-sm transition-[border-left-color,box-shadow] duration-200 ease-out hover:border-l-[#0088FF] hover:shadow-[-4px_0_12px_rgba(0,136,255,0.25)]"
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => setAvatarPreview({ companyName: h.companyName, avatarUrl: h.avatarUrl })}
                            className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1B2B4B] text-sm font-bold text-white ring-[#1B2B4B] ring-offset-2 ring-offset-white transition hover:ring-2 focus:outline-none focus-visible:ring-2"
                            aria-label={t("common.logoEnlarge")}
                          >
                            {h.avatarUrl ? (
                              <OptimizedImage
                                src={avatarImageUrl(supabase, h.avatarUrl) ?? h.avatarUrl}
                                alt=""
                                width={56}
                                height={56}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              companyInitials(h.companyName)
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-lg font-bold text-gray-900">{h.companyName}</p>
                            <p className="truncate text-sm text-slate-500">
                              {(formatIndustryForDisplay(h.industry) ?? h.industry?.trim()) || t("hirers.industry")}
                            </p>
                            {formatCityForDisplay(h.city) ? (
                              <p className="mt-1 text-xs text-slate-500">📍 {formatCityForDisplay(h.city)}</p>
                            ) : null}
                          </div>
                        </div>

                        <p className="mt-3 line-clamp-2 flex-1 text-sm leading-relaxed text-slate-600">{snippet}</p>

                        <div className="mt-3 flex items-center justify-between text-sm">
                          <p className="font-semibold text-gray-900">{h.averageRating.toFixed(1)}</p>
                          <p className="text-slate-500">{t("common.reviewCountParen", { count: h.ratingCount })}</p>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-slate-500">{t("common.jobsCount")}</p>
                            <p className="font-bold text-gray-900">{h.jobsPosted}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">{t("common.completedLabel")}</p>
                            <p className="font-bold text-gray-900">{h.completedJobs}</p>
                          </div>
                        </div>

                        <p className="mt-2 text-xs text-slate-500">{t("common.contactLabel", { name: h.contactName })}</p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {safeExternalHref(h.websiteUrl) ? (
                            <a
                              href={safeExternalHref(h.websiteUrl)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`${websiteChipClass} hover:border-[#0088FF] hover:text-[#0088FF]`}
                            >
                              {t("common.website")}
                              <ExternalLinkArrowIcon className="h-3.5 w-3.5 opacity-80" />
                            </a>
                          ) : (
                            <span className={`${websiteChipClass} cursor-default text-slate-400`} title={t("common.linkNotAdded")}>
                              {t("common.website")}
                            </span>
                          )}
                        </div>

                        <div className="mt-auto pt-3">
                          <Link
                            to={`/hirer/${h.id}`}
                            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#0088FF] px-4 text-sm font-bold text-white transition hover:bg-[#006ACC]"
                          >
                            {t("nav.profile")}
                          </Link>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
              {!error && hirersHasMore ? (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    disabled={hirersLoadingMore}
                    onClick={() => void fetchNextPage()}
                    className="h-11 rounded-lg border border-[#0088FF] px-6 text-sm font-semibold text-[#0088FF] transition hover:bg-[#E8F4FF] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {hirersLoadingMore ? t("common.loading") : t("common.loadMore")}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </main>

      {avatarPreview ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("common.logo")}
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setAvatarPreview(null)}
        >
          <button
            type="button"
            className="relative max-h-[min(85vh,900px)] max-w-[min(85vw,900px)] rounded-2xl border-4 border-white shadow-2xl ring-4 ring-black/20 sm:rounded-full"
            onClick={(e) => e.stopPropagation()}
          >
            {avatarPreview.avatarUrl ? (
              <OptimizedImage
                src={avatarImageUrl(supabase, avatarPreview.avatarUrl) ?? avatarPreview.avatarUrl}
                alt={`${avatarPreview.companyName} ${t("common.logo")}`}
                width={900}
                height={900}
                className="max-h-[min(85vh,900px)] max-w-[min(85vw,900px)] rounded-2xl object-contain sm:rounded-full"
              />
            ) : (
              <div className="flex aspect-square max-h-[min(85vh,900px)] max-w-[min(85vw,900px)] min-h-[200px] min-w-[200px] items-center justify-center rounded-2xl bg-[#1B2B4B] p-16 text-5xl font-bold text-white sm:rounded-full sm:text-7xl">
                {companyInitials(avatarPreview.companyName)}
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAvatarPreview(null)}
            className="absolute right-4 top-4 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#1B2B4B] shadow hover:bg-white"
          >
            {t("common.close")}
          </button>
        </div>
      ) : null}
    </div>
  </>
  )
}
