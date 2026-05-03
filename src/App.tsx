import { Suspense, lazy, useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { Link, Route, Routes, useNavigate, useSearchParams } from "react-router-dom"
import Navbar from "./components/Navbar.tsx"
import PageLoader from "./components/ui/PageLoader.tsx"
import NotFoundPage from "./pages/NotFound.tsx"
import { isSupabaseConfigured, supabase } from "./lib/supabase"
import ProtectedRoute from "./components/ProtectedRoute.tsx"
import LocationFilterSelect from "./components/LocationFilterSelect.tsx"
import Footer from "./components/Footer.tsx"
import HomeFeedSection from "./components/HomeFeedSection.tsx"

const DashboardPage = lazy(() => import("./pages/Dashboard.tsx"))
const BrowsePage = lazy(() => import("./pages/Browse.tsx"))
const FreelancerProfilePage = lazy(() => import("./pages/FreelancerProfile.tsx"))
const JobDetailPage = lazy(() => import("./pages/JobDetail.tsx"))
const JobsPage = lazy(() => import("./pages/Jobs.tsx"))
const OnboardingPageStandalone = lazy(() => import("./pages/Onboarding.tsx"))
const PostJobPage = lazy(() => import("./pages/PostJob.tsx"))
const ProfilePage = lazy(() => import("./pages/Profile.tsx"))
const ListingFormPage = lazy(() => import("./pages/ListingForm.tsx"))
const ListingsPage = lazy(() => import("./pages/Listings.tsx"))
const HirersPage = lazy(() => import("./pages/Hirers.tsx"))
const HirerPublicPage = lazy(() => import("./pages/HirerPublic.tsx"))
const MessagesPage = lazy(() => import("./pages/Messages"))

type HomeCategory = { id: string; name: string }

type HomeStats = {
  freelancerCount: number
  jobCount: number
  completedCount: number
}

type HeroFreelancer = {
  id: string
  slug: string
  fullName: string
  avatarUrl: string | null
  professionalTitle: string
  averageRating: number
  completedJobsCount: number
  /** Skill names from `freelancer_skills` (deduped, capped for display). */
  skillLabels: string[]
  bioSnippet: string | null
}

function getHeroInitials(fullName: string) {
  const parts = fullName.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "ფ"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US").replace(/,/g, " ")
}

/** One-line bio preview for hero cards (Georgian-friendly whitespace). */
function heroBioSnippet(raw: string | null | undefined, maxLen = 130): string | null {
  if (!raw || typeof raw !== "string") return null
  const oneLine = raw.replace(/\s+/g, " ").trim()
  if (!oneLine) return null
  if (oneLine.length <= maxLen) return oneLine
  return `${oneLine.slice(0, Math.max(0, maxLen - 1)).trim()}…`
}

function collectHeroSkillNames(freelancerSkills: unknown): string[] {
  const rows = Array.isArray(freelancerSkills) ? freelancerSkills : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of rows) {
    const r = row as { skills?: unknown }
    const sk = r.skills
    const skillObj = Array.isArray(sk) ? sk[0] : sk
    const name =
      skillObj && typeof skillObj === "object" && "name" in skillObj
        ? String((skillObj as { name?: unknown }).name ?? "").trim()
        : ""
    if (name && !seen.has(name)) {
      seen.add(name)
      out.push(name)
    }
  }
  return out
}

/** Only same-site relative paths; blocks protocol-relative URLs. */
function sanitizeLoginRedirect(raw: string | null): string | null {
  if (!raw || typeof raw !== "string") return null
  let decoded = raw.trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    return null
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return null
  if (decoded.startsWith("/login")) return null
  if (decoded.startsWith("/register")) return null
  return decoded
}


function HomePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [searchText, setSearchText] = useState("")
  const [categories, setCategories] = useState<HomeCategory[]>([])
  const [stats, setStats] = useState<HomeStats>({
    freelancerCount: 0,
    jobCount: 0,
    completedCount: 0,
  })
  const [heroFreelancers, setHeroFreelancers] = useState<HeroFreelancer[]>([])
  const [heroFreelancersLoading, setHeroFreelancersLoading] = useState(true)

  useEffect(() => {
    document.title = "გიგორი — ქართული ფრილანს პლატფორმა"
  }, [])

  useEffect(() => {
    const loadHomeData = async () => {
      setHeroFreelancersLoading(true)
      if (!supabase) {
        setHeroFreelancers([])
        setHeroFreelancersLoading(false)
        return
      }

      const [categoriesRes, freelancerRes, jobsRes, completedRes, heroRes] = await Promise.all([
        supabase.from("categories").select("id,name_ka,name_en").order("name_ka"),
        supabase
          .from("freelancer_profiles")
          .select("*", { count: "exact", head: true })
          .eq("is_public", true),
        supabase.from("jobs").select("*", { count: "exact", head: true }),
        supabase.from("completed_jobs").select("*", { count: "exact", head: true }),
        supabase
          .from("freelancer_profiles")
          .select(
            `
            id,
            slug,
            professional_title,
            average_rating,
            bio,
            completed_jobs_count,
            profiles:profiles!freelancer_profiles_user_id_fkey (full_name, avatar_url),
            freelancer_skills (
              skills (name)
            )
          `,
          )
          .eq("is_public", true)
          .order("average_rating", { ascending: false })
          .limit(3),
      ])

      if (!categoriesRes.error) {
        const mapped = (categoriesRes.data ?? []).map((cat: any) => ({
          id: cat.id,
          name: cat.name_ka ?? cat.name_en ?? "კატეგორია",
        }))
        setCategories(mapped)
      }

      setStats({
        freelancerCount: freelancerRes.count ?? 0,
        jobCount: jobsRes.count ?? 0,
        completedCount: completedRes.count ?? 0,
      })

      if (!heroRes.error && heroRes.data?.length) {
        const mappedHero: HeroFreelancer[] = (heroRes.data as any[]).map((row) => {
          const prof = row.profiles as null | { full_name: string | null; avatar_url: string | null }
          const skillLabels = collectHeroSkillNames(row.freelancer_skills)
          return {
            id: row.id,
            slug: row.slug,
            fullName: prof?.full_name?.trim() || "ფრილანსერი",
            avatarUrl: prof?.avatar_url ?? null,
            professionalTitle: row.professional_title?.trim() || "ფრილანსერი",
            averageRating: Number(row.average_rating ?? 0),
            completedJobsCount: Math.max(0, Math.floor(Number(row.completed_jobs_count ?? 0))),
            skillLabels,
            bioSnippet: heroBioSnippet(row.bio ?? null),
          }
        })

        const ids = mappedHero.map((f) => f.id)
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
          for (const m of mappedHero) {
            countMap[m.id] = Number(m.completedJobsCount ?? 0)
          }
        }

        if (!siErr && siRows) {
          for (const row of siRows) {
            const fp = row.freelancer_profile_id
            countMap[fp] = (countMap[fp] ?? 0) + 1
          }
        }

        for (const item of mappedHero) {
          item.completedJobsCount = countMap[item.id] ?? 0
        }

        setHeroFreelancers(mappedHero)
      } else {
        setHeroFreelancers([])
      }
      setHeroFreelancersLoading(false)
    }

    loadHomeData()
  }, [])

  const activeCategoryId = searchParams.get("category") ?? ""
  const showStatsBar = stats.freelancerCount >= 10

  const handleSearch = () => {
    const trimmed = searchText.trim()
    if (!trimmed) {
      navigate("/browse")
      return
    }
    navigate(`/browse?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <main className="page-enter">
      <Navbar />

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1200px] gap-6 overflow-x-auto px-4 py-3 text-sm font-medium text-slate-600 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:px-6">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => navigate(`/browse?category=${category.id}`)}
              className={`whitespace-nowrap border-b-2 pb-1 transition ${
                activeCategoryId === category.id
                  ? "border-[#D4A843] text-[#1B2B4B]"
                  : "border-transparent hover:text-[#1B2B4B]"
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <section className="bg-[#1B2B4B]">
        <div className="mx-auto grid w-full max-w-[1200px] items-stretch gap-8 px-4 py-10 md:px-6 lg:grid-cols-2 lg:py-16">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-[#D4A843]">
              იპოვე და დაიქირავე
            </p>
            <h1 className="mt-3 text-[28px] font-extrabold leading-tight text-white lg:text-[48px]">
              საუკეთესო
              <br />
              ფრილანსერები
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-slate-200">
              ითანამშრომლე გამოცდილ პროფესიონალებთან უსაფრთხო, სწრაფ და მოქნილ პლატფორმაზე.
            </p>

            <div className="mt-8 flex flex-col gap-3 rounded-xl bg-white p-3 shadow-lg sm:flex-row">
              <input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSearch()
                }}
                placeholder="რომელ უნარს ეძებ?"
                className="h-12 flex-1 rounded-md border border-slate-200 px-4 text-sm text-slate-800 outline-none ring-[#D4A843] transition placeholder:text-slate-400 focus:ring-2"
              />
              <button
                type="button"
                onClick={handleSearch}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#D4A843] px-6 text-sm font-semibold text-[#1B2B4B] transition hover:bg-[#e5bb5a]"
              >
                <span>🔎</span>
                ძებნა
              </button>
            </div>
          </div>

          <div className="relative min-h-0 rounded-2xl border border-slate-700/70 bg-[#1B2B4B] p-4">
            <div className="space-y-2">
              {heroFreelancersLoading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="rounded-xl border border-slate-600 bg-white/95 p-2 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-slate-300" />
                      <div className="flex-1">
                        <div className="h-3 w-32 animate-pulse rounded bg-slate-300" />
                        <div className="mt-2 h-2 w-24 animate-pulse rounded bg-slate-200" />
                      </div>
                      <div className="h-4 w-10 animate-pulse rounded bg-slate-200" />
                    </div>
                    <div className="mt-1 h-3 w-28 animate-pulse rounded bg-slate-200" />
                    <div className="mt-1 h-3 w-full animate-pulse rounded bg-slate-100" />
                    <div className="mt-1.5 flex gap-1">
                      <div className="h-5 w-14 animate-pulse rounded-full bg-slate-200" />
                      <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200" />
                    </div>
                  </div>
                ))
              ) : heroFreelancers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-500 bg-white/90 p-6 text-center shadow-sm">
                  <p className="text-sm font-semibold text-[#1B2B4B]">საჯარო ფრილანსერები მალე გამოჩნდება.</p>
                  <Link to="/browse" className="mt-3 inline-block text-sm font-semibold text-[#D4A843] underline">
                    კატალოგის ნახვა →
                  </Link>
                </div>
              ) : (
                heroFreelancers.map((f) => (
                  <Link
                    key={f.id}
                    to={`/freelancer/${encodeURIComponent(f.slug)}`}
                    className="block rounded-xl border border-slate-600 bg-white/95 p-2 shadow-sm transition hover:border-[#D4A843]/80 hover:bg-white"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-[11px] font-bold text-[#1B2B4B]">
                        {f.avatarUrl ? (
                          <img src={f.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          getHeroInitials(f.fullName)
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[#1B2B4B]">{f.fullName}</p>
                            <p className="truncate text-xs text-slate-600">{f.professionalTitle}</p>
                          </div>
                          <div className="shrink-0 text-xs font-semibold text-[#D4A843]">
                            ★ {f.averageRating.toFixed(1)}
                          </div>
                        </div>
                        <p className="mt-1 text-[11px] font-bold text-[#1B2B4B]">
                          <span className="tabular-nums">{f.completedJobsCount}</span>
                          {" · "}
                          შესრულებული სამუშაო
                        </p>
                        {f.bioSnippet ? (
                          <p className="mt-1 line-clamp-1 text-xs leading-snug text-slate-700 [overflow-wrap:anywhere]">
                            {f.bioSnippet}
                          </p>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {f.skillLabels.length > 0 ? (
                            f.skillLabels.slice(0, 6).map((label) => (
                              <span
                                key={label}
                                className="inline-flex max-w-full truncate rounded-full bg-[#1B2B4B]/90 px-2 py-0.5 text-[10px] font-semibold text-white"
                              >
                                {label}
                              </span>
                            ))
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              უნარები ჯერ არ არის
                            </span>
                          )}
                          {f.skillLabels.length > 6 ? (
                            <span className="text-[10px] font-medium text-slate-500">+{f.skillLabels.length - 6}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <HomeFeedSection />

      {showStatsBar ? (
        <section className="border-x border-b border-slate-200 bg-white">
          <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-6 px-4 py-8 text-center md:grid-cols-3 md:px-6">
            <div>
              <p className="text-3xl font-bold text-[#1B2B4B]">
                {stats.freelancerCount > 0 ? formatNumber(stats.freelancerCount) : "იზრდება ყოველდღე"}
              </p>
              <p className="mt-1 text-sm text-slate-500">რეგისტრირებული ფრილანსერი</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-[#1B2B4B]">
                {stats.jobCount > 0 ? formatNumber(stats.jobCount) : "იზრდება ყოველდღე"}
              </p>
              <p className="mt-1 text-sm text-slate-500">განთავსებული განცხადება</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-[#1B2B4B]">
                {stats.completedCount > 0 ? formatNumber(stats.completedCount) : "იზრდება ყოველდღე"}
              </p>
              <p className="mt-1 text-sm text-slate-500">შესრულებული სამუშაო</p>
            </div>
          </div>
        </section>
      ) : null}

      <Footer />
    </main>
  )
}

function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const reason = searchParams.get("reason")
  const redirectRaw = searchParams.get("redirect")

  useEffect(() => {
    document.title = "შესვლა — გიგორი"
  }, [])

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase პარამეტრები ვერ მოიძებნა. შეამოწმე .env ფაილი.")
      return
    }

    if (!email.trim() || !password.trim()) {
      setError("გთხოვთ შეავსოთ ელფოსტა და პაროლი.")
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("ელფოსტის ფორმატი არასწორია.")
      return
    }

    setIsSubmitting(true)
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setIsSubmitting(false)

    if (loginError) {
      const message = loginError.message.toLowerCase()
      if (message.includes("invalid login credentials")) {
        setError("ელფოსტა ან პაროლი არასწორია.")
      } else if (message.includes("invalid email")) {
        setError("ელფოსტის ფორმატი არასწორია.")
      } else {
        setError("შესვლა ვერ მოხერხდა. სცადეთ თავიდან.")
      }
      return
    }

    const safeRedirect = sanitizeLoginRedirect(redirectRaw)

    if (reason === "post-job") {
      navigate("/post-job")
      return
    }

    if (safeRedirect && reason === "contact") {
      const separator = safeRedirect.includes("?") ? "&" : "?"
      navigate(`${safeRedirect}${separator}showContact=1`)
      return
    }

    if (safeRedirect) {
      navigate(safeRedirect)
      return
    }

    navigate("/dashboard")
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] page-enter">
      <Navbar />
      <div className="mx-auto w-full max-w-xl px-4 py-10 md:px-6 md:py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-8">
          <h1 className="text-[28px] font-bold text-[#1B2B4B] md:text-4xl">ანგარიშში შესვლა</h1>
          <p className="mt-2 text-sm text-slate-500">შეიყვანე მონაცემები და გააგრძელე გიგორზე.</p>

          {reason === "post-job" ? (
            <div className="mt-5 flex items-center gap-3 rounded-lg border border-[#D4A843] bg-[#FFF8E7] px-4 py-3">
              <span className="text-xl">💼</span>
              <div>
                <p className="m-0 font-medium text-[#1B2B4B]">სამუშაოს განსათავსებლად გაიარე ავტორიზაცია</p>
                <p className="m-0 mt-0.5 text-[13px] text-[#6B7280]">
                  არ გაქვს ანგარიში?{" "}
                  <Link to="/register" className="text-[#D4A843] hover:underline">
                    დარეგისტრირდი უფასოდ
                  </Link>
                </p>
              </div>
            </div>
          ) : null}

          {reason === "contact" ? (
            <div className="mt-5 flex items-center gap-3 rounded-lg border border-[#D4A843] bg-[#FFF8E7] px-4 py-3">
              <span className="text-xl">📇</span>
              <div>
                <p className="m-0 font-medium text-[#1B2B4B]">საკონტაქტო დეტალების სანახავად გაიარე ავტორიზაცია</p>
                <p className="m-0 mt-0.5 text-[13px] text-[#6B7280]">
                  გაიარეთ შესვლა და თქვენ დაგიბრუნდებათ იმ გვერდზე, სადაც კონტაქტს ამოაჩენთ.
                </p>
              </div>
            </div>
          ) : null}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">ელფოსტა</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                placeholder="მაგ: user@gigori.ge"
              />
            </label>

            <label className="block">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#1B2B4B]">პაროლი</span>
                <a href="#" className="text-xs font-semibold text-[#D4A843] hover:underline">
                  დაავიწყდა პაროლი?
                </a>
              </div>
              <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 px-3 pr-12 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                placeholder="შეიყვანე პაროლი"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-slate-500"
              >
                {showPassword ? "დამალვა" : "ჩვენება"}
              </button>
              </div>
            </label>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="h-11 w-full rounded-lg bg-[#1B2B4B] text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "მიმდინარეობს..." : "შესვლა"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-600">
            ჯერ არ გაქვს ანგარიში?{" "}
            <Link to="/register" className="font-semibold text-[#D4A843] hover:underline">
              რეგისტრაცია
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function RegisterPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [userType, setUserType] = useState<"freelancer" | "hirer" | null>(null)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [city, setCity] = useState("")
  const [phone, setPhone] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const registerInFlightRef = useRef(false)

  useEffect(() => {
    document.title = "რეგისტრაცია — გიგორი"
  }, [])

  useEffect(() => {
    if (!cooldownUntil) {
      setCooldownSeconds(0)
      return
    }

    const updateCountdown = () => {
      const remainingMs = cooldownUntil - Date.now()
      if (remainingMs <= 0) {
        setCooldownUntil(null)
        setCooldownSeconds(0)
        return
      }
      setCooldownSeconds(Math.ceil(remainingMs / 1000))
    }

    updateCountdown()
    const timerId = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(timerId)
  }, [cooldownUntil])

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    console.log("signUp called at:", new Date().toISOString())
    setError("")

    if (isSubmitting || registerInFlightRef.current) {
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase პარამეტრები ვერ მოიძებნა. შეამოწმე .env ფაილი.")
      return
    }

    if (cooldownUntil && Date.now() < cooldownUntil) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000)
      setError(`ზედმეტი მცდელობები დაფიქსირდა. სცადე ${secondsLeft} წამში.`)
      return
    }

    if (!userType) {
      setError("გთხოვთ აირჩიოთ ანგარიშის ტიპი.")
      return
    }

    if (!fullName.trim() || !email.trim() || !password.trim() || !confirmPassword.trim() || !city.trim()) {
      setError("გთხოვთ შეავსოთ ყველა სავალდებულო ველი.")
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("გთხოვთ მიუთითოთ სწორი ელფოსტა (მაგ: user@example.com).")
      return
    }

    if (password.length < 6) {
      setError("პაროლი უნდა შეიცავდეს მინიმუმ 6 სიმბოლოს.")
      return
    }

    if (password !== confirmPassword) {
      setError("პაროლები ერთმანეთს არ ემთხვევა.")
      return
    }

    const formData = {
      full_name: fullName.trim(),
      email: email.trim(),
      password,
      confirm_password: confirmPassword,
      city: city.trim(),
      phone: phone.trim(),
      user_type: userType,
    }

    const signUpPayload = {
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          full_name: formData.full_name,
          user_type: formData.user_type,
          city: formData.city,
          phone: formData.phone,
        },
      },
    }

    console.log("Supabase signUp payload:", signUpPayload)

    setIsSubmitting(true)
    registerInFlightRef.current = true
    try {
      const { error: registerError } = await supabase.auth.signUp(signUpPayload)

      if (registerError) {
        console.error("Supabase signUp error:", {
          message: registerError.message,
          status: registerError.status,
          name: registerError.name,
        })
        const message = registerError.message.toLowerCase()
        if (message.includes("user already registered")) {
          setError("ეს ელფოსტა უკვე გამოყენებულია.")
        } else if (message.includes("invalid email")) {
          setError("ელფოსტის ფორმატი არასწორია.")
        } else if (message.includes("rate limit") || registerError.status === 429) {
          setCooldownUntil(Date.now() + 60_000)
          setError("ზედმეტი მცდელობები დაფიქსირდა. გთხოვ, სცადე 60 წამში.")
        } else if (message.includes("email signups are disabled")) {
          setError("ელფოსტით რეგისტრაცია გათიშულია Supabase პროექტში.")
        } else if (message.includes("password")) {
          setError("პაროლი არ აკმაყოფილებს მოთხოვნებს.")
        } else {
          setError(`რეგისტრაცია ვერ მოხერხდა: ${registerError.message}`)
        }
        return
      }

      navigate("/onboarding")
    } finally {
      setIsSubmitting(false)
      registerInFlightRef.current = false
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] page-enter">
      <Navbar />
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6 md:py-14">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-8">
          <h1 className="text-[28px] font-bold text-[#1B2B4B] md:text-4xl">რეგისტრაცია</h1>
          <p className="mt-2 text-sm text-slate-500">
            ნაბიჯი {step}/2 — შექმენი ანგარიში გიგორზე.
          </p>

          {step === 1 ? (
            <div className="mt-7 grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setUserType("freelancer")
                  setStep(2)
                }}
                className="rounded-xl border-2 border-slate-200 p-5 text-left transition hover:border-[#D4A843] hover:bg-amber-50"
              >
                <p className="text-xl font-bold text-[#1B2B4B]">ფრილანსერი</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  შემოგვიერთდი როგორც სპეციალისტი, მიიღე შეკვეთები და გაზარდე შემოსავალი.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setUserType("hirer")
                  setStep(2)
                }}
                className="rounded-xl border-2 border-slate-200 p-5 text-left transition hover:border-[#D4A843] hover:bg-amber-50"
              >
                <p className="text-xl font-bold text-[#1B2B4B]">დამქირავებელი</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  განათავსე პროექტები, იპოვე პროფესიონალი ფრილანსერები და დაიქირავე სწრაფად.
                </p>
              </button>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="mt-7 space-y-4">
              <div className="rounded-lg border border-[#D4A843]/40 bg-amber-50 px-4 py-2 text-sm text-[#1B2B4B]">
                არჩეული ტიპი:{" "}
                <span className="font-semibold">
                  {userType === "freelancer" ? "ფრილანსერი" : "დამქირავებელი"}
                </span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="ml-3 font-semibold text-[#D4A843] hover:underline"
                >
                  შეცვლა
                </button>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">სრული სახელი</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">ელფოსტა</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">პაროლი</span>
                  <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 pr-12 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                  />
                  <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-slate-500">
                    {showPassword ? "დამალვა" : "ჩვენება"}
                  </button>
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                    გაიმეორე პაროლი
                  </span>
                  <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 pr-12 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                  />
                  <button type="button" onClick={() => setShowConfirmPassword((prev) => !prev)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-slate-500">
                    {showConfirmPassword ? "დამალვა" : "ჩვენება"}
                  </button>
                  </div>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">ქალაქი / ლოკაცია</span>
                  <LocationFilterSelect
                    value={city}
                    onChange={setCity}
                    variant="form"
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                    ტელეფონი (არასავალდებულო)
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                  />
                </label>
              </div>

              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting || cooldownSeconds > 0}
                className="h-11 w-full rounded-lg bg-[#1B2B4B] text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting
                  ? "მიმდინარეობს..."
                  : cooldownSeconds > 0
                    ? `სცადე ${cooldownSeconds} წამში`
                    : "რეგისტრაცია"}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-600">
            უკვე გაქვს ანგარიში?{" "}
            <Link to="/login" className="font-semibold text-[#D4A843] hover:underline">
              შესვლა
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function OnboardingPage() {
  return <OnboardingPageStandalone />
}

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/listings" element={<ListingsPage />} />
        <Route path="/hirers" element={<HirersPage />} />
        <Route path="/hirer/:id" element={<HirerPublicPage />} />
        <Route path="/freelancer/:slug" element={<FreelancerProfilePage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/job/:id" element={<JobDetailPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/messages"
          element={
            <ProtectedRoute>
              <MessagesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/post-job/:jobId"
          element={
            <ProtectedRoute>
              <PostJobPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/post-job"
          element={
            <ProtectedRoute>
              <PostJobPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/listing/new"
          element={
            <ProtectedRoute>
              <ListingFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/listing/:id/edit"
          element={
            <ProtectedRoute>
              <ListingFormPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default App
