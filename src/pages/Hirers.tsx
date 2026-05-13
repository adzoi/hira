import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import EmptyState from "../components/ui/EmptyState.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import LocationFilterSelect from "../components/LocationFilterSelect.tsx"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { formatCityForDisplay, matchesLocationFilter } from "../lib/marketplaceFilters.ts"

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

function ratingStars(value: number) {
  const rounded = Math.round(value)
  return `${"★".repeat(Math.max(0, rounded))}${"☆".repeat(Math.max(0, 5 - rounded))}`
}

const mockHirers: HirerRow[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    ownerUserId: "00000000-0000-0000-0000-000000000011",
    companyName: "TechStart Georgia",
    industry: "ტექნოლოგია",
    description: "პარალელური პროდუქტის გუნდი თბილისიდან — ვახერხებთ ვებ და მობაილ შეკვეთებს.",
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
    description: "ოჯახური რესტორნის ბრენდი — ხშირად გვესაჭიროება მარკეტინგი და შინაარსი.",
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

export default function HirersPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [hirers, setHirers] = useState<HirerRow[]>([])
  const [searchText, setSearchText] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("jobs_desc")
  const [visibleCount, setVisibleCount] = useState(24)

  const [advancedDropdownOpen, setAdvancedDropdownOpen] = useState(false)
  const advancedDropdownRef = useRef<HTMLDivElement>(null)

  const [locationFilter, setLocationFilter] = useState("")
  const [draftLocationFilter, setDraftLocationFilter] = useState("")
  const [avatarPreview, setAvatarPreview] = useState<{ companyName: string; avatarUrl: string | null } | null>(null)

  useEffect(() => {
    document.title = "დამქირავებლები — გიგორი"
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
        setHirers(mockHirers)
        setLoading(false)
        return
      }

      setLoading(true)
      setError("")
      try {
        const { data, error: qErr } = await supabase
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
          )
          .order("jobs_posted_count", { ascending: false })

        if (qErr) throw qErr

        const mapped: HirerRow[] = (data ?? []).map((row: any) => {
          const profile = row.profiles as null | {
            full_name: string | null
            avatar_url: string | null
            city: string | null
          }
          const company = row.company_name?.trim() || "დამქირავებელი"
          return {
            id: row.id as string,
            ownerUserId: row.user_id as string,
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
          const [{ data: cjRows, error: cjErr }, { data: siRows, error: siErr }] = await Promise.all([
            supabase.from("completed_jobs").select("hirer_profile_id").in("hirer_profile_id", ids),
            supabase
              .from("service_inquiries")
              .select("hirer_profile_id")
              .eq("status", "completed")
              .in("hirer_profile_id", ids),
          ])
          const ownerIds = Array.from(new Set(mapped.map((h) => h.ownerUserId).filter(Boolean)))
          const ownerToHirerId = mapped.reduce<Record<string, string>>((acc, h) => {
            if (h.ownerUserId) acc[h.ownerUserId] = h.id
            return acc
          }, {})
          const { data: reviewRows, error: reviewErr } = await supabase
            .from("reviews")
            .select("reviewee_id, rating_overall")
            .in("reviewee_id", ownerIds)

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

        setHirers(mapped)
      } catch (e) {
        const message =
          e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : ""
        setError(message || "დამქირავებლების ჩამონათვალის წაკითხვა ვერ მოხერხდა.")
        setHirers([])
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const industryCategories = useMemo(() => {
    const names = new Set<string>()
    for (const h of hirers) {
      const raw = h.industry?.trim()
      if (raw) names.add(raw)
    }
    return [...names]
      .sort((a, b) => a.localeCompare(b, "ka"))
      .map((name) => ({ id: name, name_ka: name }))
  }, [hirers])

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
    setVisibleCount(24)
  }

  const advancedFilterCount = locationFilter.trim() ? 1 : 0

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
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
      const blob = `${h.companyName} ${h.industry ?? ""} ${h.city ?? ""} ${h.contactName} ${desc}`.toLowerCase()
      return blob.includes(q)
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

  const visible = sorted.slice(0, visibleCount)

  if (loading) {
    return (
      <div className="min-h-screen bg-white page-enter">
        <Navbar />
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

  return (
    <div className="min-h-screen bg-white page-enter">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-6 py-6 font-sans text-slate-600 md:px-8 md:py-8">
        <section className="p-1 md:p-0">
          <div className="mt-5 p-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="min-w-[220px] flex-[0_1_320px]">
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  className="h-10 w-full rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-500 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:ring-2 focus:ring-[#0088FF]"
                  placeholder="კომპანია, ინდუსტრია, ქალაქი ან აღწერა"
                />
              </div>

              <label className="relative inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-500">
                <span className="truncate">ინდუსტრია</span>
                <span className="ml-auto text-slate-400">▾</span>
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="ინდუსტრია"
                >
                  <option value="">ყველა ინდუსტრია</option>
                  {industryCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name_ka}
                    </option>
                  ))}
                </select>
              </label>

              <label className="relative inline-flex h-10 min-w-[10.5rem] max-w-[14rem] shrink-0 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-500">
                <span className="pointer-events-none min-w-0 flex-1 truncate">
                  {locationFilter.trim() ? formatCityForDisplay(locationFilter) ?? locationFilter : "ლოკაცია / ქალაქი"}
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
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-500 transition hover:border-slate-400"
                >
                  <span>გაფართოებული ძიება</span>
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
                        <h2 className="border-l-4 border-[#0088FF] pl-3 text-base font-bold text-[#1B2B4B]">გაფართოებული ფილტრები</h2>
                        <div className="mt-4 space-y-4">
                          <label className="block pb-1">
                            <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">ლოკაცია / ქალაქი</span>
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
                <span className="truncate">სორტირება</span>
                <span className="ml-auto text-slate-400">▾</span>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortOption)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="სორტირება"
                >
                  <option value="jobs_desc">განცხადებების რაოდენობა</option>
                  <option value="completed_desc">დასრულებული სამუშაო</option>
                  <option value="newest">ახალი რეგისტრაცია</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => setAdvancedDropdownOpen(false)}
                className="ml-auto inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#0088FF] px-8 text-base font-bold text-white transition hover:bg-[#006ACC]"
              >
                ძიება
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 min-w-0">
          <p className="text-sm font-medium text-slate-600">შედეგი {sorted.length} დამქირავებელი</p>

          {error ? <ErrorState message={error} /> : null}

          {!error && sorted.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                message="დამქირავებლები ჯერ არ ჩანს ან შედეგები ცარიელია საძიებლო შეკითხვით."
                actionLabel="ფილტრების გასუფთავება"
                onAction={clearFilters}
              />
            </div>
          ) : (
            <>
              {!error ? (
                <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {visible.map((h) => {
                    const desc = (h.description ?? "").trim()
                    const snippet =
                      desc.length > 160 ? `${desc.slice(0, 160)}…` : desc || "კომპანიის შესახებ ტექსტი ხელმისაწვდომი იქნება პროფილიდან."
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
                            aria-label="ლოგოს გადიდება"
                          >
                            {h.avatarUrl ? (
                              <img
                                src={avatarImageUrl(supabase, h.avatarUrl) ?? h.avatarUrl}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              companyInitials(h.companyName)
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-lg font-bold text-gray-900">{h.companyName}</p>
                            <p className="truncate text-sm text-slate-500">{h.industry?.trim() || "ინდუსტრია"}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              📍 {formatCityForDisplay(h.city) ?? h.city ?? "ქალაქი უცნობია"}
                            </p>
                          </div>
                        </div>

                        <p className="mt-3 line-clamp-2 flex-1 text-sm leading-relaxed text-slate-600">{snippet}</p>

                        <div className="mt-3 flex items-center justify-between text-sm">
                          <p className="font-semibold">
                            <span className="text-amber-500">{ratingStars(h.averageRating)}</span>
                            <span className="text-gray-900"> {h.averageRating.toFixed(1)}</span>
                          </p>
                          <p className="text-slate-500">({h.ratingCount} შეფასება)</p>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-slate-500">განცხადებები</p>
                            <p className="font-bold text-gray-900">{h.jobsPosted}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">დასრულებული</p>
                            <p className="font-bold text-gray-900">{h.completedJobs}</p>
                          </div>
                        </div>

                        <p className="mt-2 text-xs text-slate-500">საკონტაქტო: {h.contactName}</p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {h.websiteUrl ? (
                            <a
                              href={h.websiteUrl.startsWith("http") ? h.websiteUrl : `https://${h.websiteUrl}`}
                              target="_blank"
                              rel="noreferrer noopener"
                              className={`${websiteChipClass} hover:border-[#0088FF] hover:text-[#0088FF]`}
                            >
                              ვებგვერდი
                              <ExternalLinkArrowIcon className="h-3.5 w-3.5 opacity-80" />
                            </a>
                          ) : (
                            <span className={`${websiteChipClass} cursor-default text-slate-400`} title="ბმული არ არის დამატებული">
                              ვებგვერდი
                            </span>
                          )}
                        </div>

                        <div className="mt-auto pt-3">
                          <Link
                            to={`/hirer/${h.id}`}
                            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#0088FF] px-4 text-sm font-bold text-white transition hover:bg-[#006ACC]"
                          >
                            პროფილი
                          </Link>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
              {!error && visible.length < sorted.length ? (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + 24)}
                    className="h-11 rounded-lg border border-[#0088FF] px-6 text-sm font-semibold text-[#0088FF] transition hover:bg-[#E8F4FF]"
                  >
                    მეტის ნახვა
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
          aria-label="ლოგო"
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setAvatarPreview(null)}
        >
          <button
            type="button"
            className="relative max-h-[min(85vh,900px)] max-w-[min(85vw,900px)] rounded-2xl border-4 border-white shadow-2xl ring-4 ring-black/20 sm:rounded-full"
            onClick={(e) => e.stopPropagation()}
          >
            {avatarPreview.avatarUrl ? (
              <img
                src={avatarImageUrl(supabase, avatarPreview.avatarUrl) ?? avatarPreview.avatarUrl}
                alt={`${avatarPreview.companyName} ლოგო`}
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
            დახურვა
          </button>
        </div>
      ) : null}
    </div>
  )
}
