import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import EmptyState from "../components/ui/EmptyState.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import MarketplaceCatalogToolbar from "../components/MarketplaceCatalogToolbar.tsx"
import LocationFilterSelect from "../components/LocationFilterSelect.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { matchesLocationFilter } from "../lib/marketplaceFilters.ts"

type HirerRow = {
  id: string
  companyName: string
  industry: string | null
  description: string | null
  websiteUrl: string | null
  jobsPosted: number
  completedJobs: number
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

const mockHirers: HirerRow[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    companyName: "TechStart Georgia",
    industry: "ტექნოლოგია",
    description: "პარალელური პროდუქტის გუნდი თბილისიდან — ვახერხებთ ვებ და მობაილ შეკვეთებს.",
    websiteUrl: null,
    jobsPosted: 4,
    completedJobs: 12,
    contactName: "ლაშა რ.",
    avatarUrl: null,
    city: "თბილისი",
    createdAt: new Date().toISOString(),
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    companyName: "Café Leila",
    industry: "სტუმართმოყვარეობა",
    description: "ოჯახური რესტორნის ბრენდი — ხშირად გვესაჭიროება მარკეტინგი და შინაარსი.",
    websiteUrl: null,
    jobsPosted: 8,
    completedJobs: 20,
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
            companyName: company,
            industry: row.industry ?? null,
            description: row.description ?? null,
            websiteUrl: row.website_url ?? null,
            jobsPosted: Number(row.jobs_posted_count ?? 0),
            completedJobs: Number(row.completed_jobs_count ?? 0),
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

          const countMap: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]))

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

          for (const item of mapped) {
            item.completedJobs = countMap[item.id] ?? 0
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
      <div className="min-h-screen bg-[#F8F9FC]">
        <Navbar />
        <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] page-enter">
      <Navbar />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
        <MarketplaceCatalogToolbar
          eyebrow="საჯარო წინადადებები"
          title="დამქირავებლები"
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="კომპანია, ინდუსტრია, ქალაქი ან აღწერა"
          categories={industryCategories}
          categoryId={categoryId}
          onCategoryChange={setCategoryId}
          categoryLabel="ინდუსტრია"
          sortValue={sortBy}
          onSortChange={(value) => setSortBy(value as SortOption)}
          sortOptions={[
            { value: "jobs_desc", label: "განცხადებების რაოდენობა" },
            { value: "completed_desc", label: "დასრულებული სამუშაო" },
            { value: "newest", label: "ახალი რეგისტრაცია" },
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
              <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">ლოკაცია / ქალაქი</span>
              <LocationFilterSelect
                value={draftLocationFilter}
                onChange={setDraftLocationFilter}
                className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
              />
            </label>
          }
        />

        <p className="mt-3 text-sm text-slate-600">პლატფორმაზე რეგისტრირებული კომპანიები და გუნდები — ნაჩვენებია {sorted.length} შედეგი.</p>

        {error ? <ErrorState message={error} /> : null}

        {!error && sorted.length === 0 ? (
          <div className="mt-6">
            <EmptyState message="დამქირავებლები ჯერ არ ჩანს ან შედეგები ცარიელია საძიებლო შეკითხვით." actionLabel="ფილტრების გასუფთავება" onAction={clearFilters} />
          </div>
        ) : (
          <>
            {!error ? (
              <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((h) => {
                  const desc = (h.description ?? "").trim()
                  const snippet = desc.length > 140 ? `${desc.slice(0, 140)}…` : desc || "კომპანიის შესახებ ტექსტი ხელმისაწვდომი იქნება პროფილიდან."
                  return (
                    <li key={h.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#D4A843]/70">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => setAvatarPreview({ companyName: h.companyName, avatarUrl: h.avatarUrl })}
                          className="group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#1B2B4B]/5 text-xs font-black text-[#1B2B4B] ring-[#1B2B4B] ring-offset-2 ring-offset-white transition hover:ring-2 focus:outline-none focus-visible:ring-2"
                          aria-label="ლოგოს გადიდება"
                        >
                          {h.avatarUrl ? (
                            <img src={h.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            companyInitials(h.companyName)
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-lg font-extrabold text-[#1B2B4B]">{h.companyName}</h2>
                          <p className="text-xs font-semibold text-slate-500">{[h.industry, h.city].filter(Boolean).join(" · ") || "Georgia"}</p>
                        </div>
                      </div>
                      <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-700">{snippet}</p>
                      <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm">
                        <div>
                          <dt className="text-xs uppercase text-slate-500">განცხადებები</dt>
                          <dd className="font-bold text-[#1B2B4B]">{h.jobsPosted}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-slate-500">დასრულებული</dt>
                          <dd className="font-bold text-[#1B2B4B]">{h.completedJobs}</dd>
                        </div>
                        <div className="col-span-2 pt-1 text-xs text-slate-600">საკონტაქტო: {h.contactName}</div>
                      </dl>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm">
                        {h.websiteUrl ? (
                          <a
                            href={h.websiteUrl.startsWith("http") ? h.websiteUrl : `https://${h.websiteUrl}`}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-[#1B2B4B] hover:border-[#D4A843]"
                          >
                            ვებგვერდი
                            <ExternalLinkArrowIcon className="h-3.5 w-3.5 opacity-80" />
                          </a>
                        ) : (
                          <span
                            className="inline-flex cursor-default items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-400"
                            title="ბმული არ არის დამატებული"
                          >
                            ვებგვერდი
                          </span>
                        )}
                      </div>
                      <Link
                        to={`/hirer/${h.id}`}
                        className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[#1B2B4B] px-4 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B]"
                      >
                        პროფილი
                      </Link>
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
                  className="rounded-lg border border-[#D4A843] px-6 py-3 text-sm font-semibold text-[#1B2B4B] hover:bg-amber-50"
                >
                  მეტის ნახვა
                </button>
              </div>
            ) : null}
          </>
        )}
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
                src={avatarPreview.avatarUrl}
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
