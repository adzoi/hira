import { PayPalScriptProvider } from "@paypal/react-paypal-js"
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import { Link, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import Navbar from "./components/Navbar.tsx"
import PageLoader from "./components/ui/PageLoader.tsx"
import NotFoundPage from "./pages/NotFound.tsx"
import { avatarImageUrl } from "./lib/storageImageUrl.ts"
import { isSupabaseConfigured, supabase } from "./lib/supabase"
import ProtectedRoute from "./components/ProtectedRoute.tsx"
import LocationFilterSelect from "./components/LocationFilterSelect.tsx"
import Footer from "./components/Footer.tsx"
import HomeFeedSection from "./components/HomeFeedSection.tsx"
import { stripLegacyPricePrefix } from "./lib/listingDescription.ts"

const DashboardPage = lazy(() => import("./pages/Dashboard.tsx"))
const BrowsePage = lazy(() => import("./pages/Browse.tsx"))
const FreelancerProfilePage = lazy(() => import("./pages/FreelancerProfile.tsx"))
const JobDetailPage = lazy(() => import("./pages/JobDetail.tsx"))
const JobsPage = lazy(() => import("./pages/Jobs.tsx"))
const OnboardingPageStandalone = lazy(() => import("./pages/Onboarding.tsx"))
const PostJobPage = lazy(() => import("./pages/PostJob.tsx"))
const ProfilePage = lazy(() => import("./pages/Profile.tsx"))
const ListingFormPage = lazy(() => import("./pages/ListingForm.tsx"))
const ListingDetailPage = lazy(() => import("./pages/ListingDetail.tsx"))
const CVGeneratorPage = lazy(() => import("./pages/CVGenerator.tsx"))
const PublicCVPage = lazy(() => import("./pages/PublicCV.tsx"))
const ListingsPage = lazy(() => import("./pages/Listings.tsx"))
const HirersPage = lazy(() => import("./pages/Hirers.tsx"))
const HirerPublicPage = lazy(() => import("./pages/HirerPublic.tsx"))
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPassword.tsx"))
const ResetPasswordPage = lazy(() => import("./pages/ResetPassword.tsx"))
const PayPalCheckoutE2EPage = lazy(() => import("./pages/PayPalCheckoutE2E.tsx"))

type HomeStats = {
  freelancerCount: number
  jobCount: number
  completedCount: number
}

type HomepageVipRenderableItem = {
  type: "job" | "freelancer"
  id: string
  title?: string
  name?: string
  vip_expires_at: string
  href: string
  subtitle: string
  description: string
  avatarUrl: string | null
  rating: number
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US").replace(/,/g, " ")
}

function shortText(raw: string | null | undefined, max = 100): string {
  const normalized = String(raw ?? "").replace(/\s+/g, " ").trim()
  if (!normalized) return "დეტალები განცხადების გვერდზე."
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trim()}…`
}

function gigoriListingDescriptionPlain(raw: string | null | undefined): string {
  const META_PREFIX = "<!--gigori-meta:"
  const META_SUFFIX = "-->"
  let body = String(raw ?? "")
  if (body.startsWith(META_PREFIX)) {
    const endIndex = body.indexOf(META_SUFFIX)
    if (endIndex >= 0) {
      body = body.slice(endIndex + META_SUFFIX.length).trimStart()
    }
  }
  return stripLegacyPricePrefix(body).replace(/\s+/g, " ").trim()
}

function initials(value: string): string {
  const parts = value.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "G"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function ratingStars(value: number) {
  const rounded = Math.round(value)
  return `${"★".repeat(Math.max(0, rounded))}${"☆".repeat(Math.max(0, 5 - rounded))}`
}

function showVipCardRating(value: number) {
  return Number.isFinite(value) && value > 0
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
  const [searchText, setSearchText] = useState("")
  const [stats, setStats] = useState<HomeStats>({
    freelancerCount: 0,
    jobCount: 0,
    completedCount: 0,
  })
  const [homepageVipItems, setHomepageVipItems] = useState<HomepageVipRenderableItem[]>([])
  const [homepageVipLoading, setHomepageVipLoading] = useState(true)
  const [homepageVipStartIndex, setHomepageVipStartIndex] = useState(0)
  /** Which VIP strip we show: hirer job postings vs freelancer listings — opposite of viewer’s role (guest = talent). */
  const [vipBoxMode, setVipBoxMode] = useState<"job" | "freelancer">("freelancer")

  useEffect(() => {
    document.title = "გიგორი — ქართული freelance პლატფორმა"
  }, [])

  useEffect(() => {
    const loadHomeData = async () => {
      if (!supabase) {
        return
      }

      const [freelancerRes, jobsRes, completedRes] = await Promise.all([
        supabase
          .from("freelancer_profiles")
          .select("*", { count: "exact", head: true })
          .eq("is_public", true)
          .limit(1),
        supabase.from("jobs").select("*", { count: "exact", head: true }).limit(1),
        supabase.from("completed_jobs").select("*", { count: "exact", head: true }).limit(1),
      ])

      setStats({
        freelancerCount: freelancerRes.count ?? 0,
        jobCount: jobsRes.count ?? 0,
        completedCount: completedRes.count ?? 0,
      })
    }

    loadHomeData()
  }, [])

  useEffect(() => {
    type HirerNest = null | {
      id?: string | null
      user_id?: string | null
      company_name?: string | null
      average_rating_given?: number | null
      profiles?: null | { full_name?: string | null; avatar_url?: string | null }
    }
    type FreelancerNest = null | {
      user_id?: string | null
      slug?: string | null
      professional_title?: string | null
      average_rating?: number | null
      is_public?: boolean | null
      profiles?: null | { full_name?: string | null; avatar_url?: string | null }
    }

    const loadHomepageVip = async () => {
      if (!supabase) {
        setHomepageVipItems([])
        setHomepageVipStartIndex(0)
        setVipBoxMode("freelancer")
        setHomepageVipLoading(false)
        return
      }
      const nowIso = new Date().toISOString()

      let userType: "freelancer" | "hirer" | null = null
      if (isSupabaseConfigured) {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", user.id).maybeSingle()
          if (profile?.user_type === "freelancer") userType = "freelancer"
          else if (profile?.user_type === "hirer") userType = "hirer"
        }
      }

      // Freelancers seek work → hirer VIP jobs; hirers & guests seek talent → freelancer VIP listings (never mix).
      const showHirerJobVip = userType === "freelancer"
      setVipBoxMode(showHirerJobVip ? "job" : "freelancer")

      if (showHirerJobVip) {
        const { data: vipJobsData, error: vipJobsErr } = await supabase
          .from("jobs")
          .select(
            `
          id,
          title,
          description,
          hirer_profile_id,
          vip_expires_at,
          hirer_profiles (
            id,
            user_id,
            company_name,
            average_rating_given,
            profiles:profiles!hirer_profiles_user_id_fkey (
              full_name,
              avatar_url
            )
          )
        `,
          )
          .eq("status", "open")
          .eq("is_vip", true)
          .gt("vip_expires_at", nowIso)
          .order("vip_expires_at", { ascending: false })
          .limit(12)

        if (vipJobsErr) console.warn(vipJobsErr)

        const jobItems: HomepageVipRenderableItem[] = (vipJobsData ?? []).map((row) => {
          const hpRaw = (row as { hirer_profiles?: HirerNest | HirerNest[] }).hirer_profiles
          const hp = Array.isArray(hpRaw) ? hpRaw[0] : hpRaw
          const profile = hp?.profiles
          const companyName = hp?.company_name?.trim() || profile?.full_name?.trim() || "დამქირავებელი"
          const desc = String((row as { description?: string | null }).description ?? "").replace(/\s+/g, " ").trim()
          const rating = Number(hp?.average_rating_given ?? 0)
          const expires = String((row as { vip_expires_at?: string | null }).vip_expires_at ?? nowIso)
          return {
            type: "job",
            id: String((row as { id: string }).id),
            title: String((row as { title?: string | null }).title ?? "").trim() || "სამუშაო",
            name: companyName,
            vip_expires_at: expires,
            subtitle: "დამქირავებელი",
            description: shortText(desc),
            avatarUrl: profile?.avatar_url ?? null,
            rating: Number.isFinite(rating) ? rating : 0,
            href: `/job/${encodeURIComponent(String((row as { id: string }).id))}`,
          } satisfies HomepageVipRenderableItem
        })

        setHomepageVipItems(jobItems)
      } else {
        const { data: vipServicesData, error: vipServicesErr } = await supabase
          .from("services")
          .select(
            `
          id,
          title,
          description,
          vip_expires_at,
          freelancer_profiles (
            user_id,
            slug,
            professional_title,
            average_rating,
            is_public,
            profiles:profiles!freelancer_profiles_user_id_fkey (
              full_name,
              avatar_url
            )
          )
        `,
          )
          .eq("is_active", true)
          .eq("is_vip", true)
          .gt("vip_expires_at", nowIso)
          .order("vip_expires_at", { ascending: false })
          .limit(12)

        if (vipServicesErr) console.warn(vipServicesErr)

        const freelancerItems: HomepageVipRenderableItem[] = []
        for (const row of vipServicesData ?? []) {
          const fpRaw = (row as { freelancer_profiles?: FreelancerNest | FreelancerNest[] }).freelancer_profiles
          const fp = Array.isArray(fpRaw) ? fpRaw[0] : fpRaw
          if (!fp?.slug || fp.is_public === false) continue
          const prof = fp.profiles
          const rating = Number(fp.average_rating ?? 0)
          const descPlain = gigoriListingDescriptionPlain((row as { description?: string | null }).description)
          const expires = String((row as { vip_expires_at?: string | null }).vip_expires_at ?? nowIso)
          freelancerItems.push({
            type: "freelancer",
            id: String((row as { id: string }).id),
            title: String((row as { title?: string | null }).title ?? "").trim() || "სერვისი",
            name: prof?.full_name?.trim() || "ფრილანსერი",
            vip_expires_at: expires,
            subtitle: fp.professional_title?.trim() || "ფრილანსერი",
            description: shortText(descPlain),
            avatarUrl: prof?.avatar_url ?? null,
            rating: Number.isFinite(rating) ? rating : 0,
            href: `/listing/${encodeURIComponent(String((row as { id: string }).id))}`,
          } satisfies HomepageVipRenderableItem)
        }

        setHomepageVipItems(freelancerItems)
      }

      setHomepageVipStartIndex(0)
      setHomepageVipLoading(false)
    }

    void (async () => {
      setHomepageVipLoading(true)
      await loadHomepageVip()
    })()
  }, [])

  useEffect(() => {
    if (homepageVipItems.length <= 3) return
    const timerId = window.setInterval(() => {
      setHomepageVipStartIndex((prev) => (prev + 1) % homepageVipItems.length)
    }, 30_000)
    return () => window.clearInterval(timerId)
  }, [homepageVipItems])

  const showStatsBar = stats.freelancerCount >= 10

  useEffect(() => {
    setHomepageVipStartIndex(0)
  }, [homepageVipItems.length])

  const visibleHomepageVipItems = useMemo(() => {
    if (homepageVipItems.length <= 3) return homepageVipItems
    return Array.from({ length: 3 }, (_, idx) => homepageVipItems[(homepageVipStartIndex + idx) % homepageVipItems.length])
  }, [homepageVipItems, homepageVipStartIndex])

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

      <section className="bg-[#2563EB]">
        <div className="mx-auto grid w-full max-w-[1200px] items-stretch gap-8 px-4 py-10 md:px-6 lg:grid-cols-2 lg:py-16">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-[#F59E0B]">
              იპოვე 
            </p>
            <h1 className="mt-3 text-[28px] font-extrabold leading-tight text-white lg:text-[48px]">
              საუკეთესო
              <br />
              ფრილანსერები
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-slate-200">
              ითანამშრომლე გამოცდილ პროფესიონალებთან უსაფრთხო, სწრაფ და მოქნილ პლატფორმაზე.
            </p>

            <div className="mt-8 flex flex-col gap-2 rounded-xl bg-white p-3 shadow-lg sm:flex-row sm:items-center">
              <input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSearch()
                }}
                placeholder="რომელ უნარს ეძებ?"
                className="h-10 min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-500 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:ring-2 focus:ring-[#2563EB]"
              />
              <button
                type="button"
                onClick={handleSearch}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-white px-8 text-base font-bold text-[#2563EB] transition hover:bg-blue-50"
              >
                ძებნა
              </button>
            </div>
          </div>

          <div className="relative min-h-0 rounded-2xl border border-white/15 bg-[#1D4ED8] p-4">
            <p className="mb-2 text-sm font-bold uppercase tracking-wide text-white">
              {vipBoxMode === "job" ? "VIP სამუშაოები" : "VIP ფრილანსერები"}
            </p>
            <div className="space-y-2">
              {homepageVipLoading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="relative rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
                    <div className="flex gap-3">
                      <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-slate-200" />
                      <div className="min-w-0 flex-1 space-y-2 pr-10">
                        <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
                        <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
                        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                        <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                      </div>
                    </div>
                  </div>
                ))
              ) : homepageVipItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/40 bg-white/10 p-6 text-center shadow-sm">
                  <p className="text-sm font-semibold text-white">ამ ფილტრისთვის VIP განცხადებები არ არის.</p>
                </div>
              ) : (
                visibleHomepageVipItems.map((item) => (
                  <Link
                    key={`${item.type}-${item.id}`}
                    to={item.href}
                    className="relative block overflow-hidden rounded-xl border border-slate-200/80 border-l-[3px] border-l-transparent bg-white p-3 shadow-sm transition-[border-left-color,box-shadow] duration-200 ease-out hover:border-l-[#2563EB] hover:shadow-[-4px_0_12px_rgba(37,99,235,0.25)]"
                  >
                    <span className="absolute right-3 top-3 z-10 rounded-full bg-[#F59E0B] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                      VIP
                    </span>
                    <div className="flex gap-3 pr-14">
                      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-[11px] font-bold text-[#1B2B4B]">
                        {item.avatarUrl ? (
                          <img
                            src={avatarImageUrl(supabase, item.avatarUrl) ?? item.avatarUrl}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          initials(item.name ?? item.subtitle)
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-gray-900">{item.name || item.subtitle}</p>
                        {showVipCardRating(item.rating) ? (
                          <p className="mt-1 text-sm font-semibold text-amber-500">
                            <span className="tracking-tight">{ratingStars(item.rating)}</span>{" "}
                            <span className="text-gray-900">{item.rating.toFixed(1)}</span>
                          </p>
                        ) : null}
                        <p className={`line-clamp-1 text-sm font-bold text-gray-900 ${showVipCardRating(item.rating) ? "mt-2" : "mt-1"}`}>
                          {item.title || item.name || (item.type === "job" ? "VIP Job" : "VIP Freelancer")}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">{item.description}</p>
                        <span className="mt-2 inline-flex max-w-full items-center rounded-full border border-[#D1D5DB] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#374151]">
                          {item.type === "job" ? "სამუშაო" : "ფრილანსერი"}
                        </span>
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
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const reason = searchParams.get("reason")
  const redirectRaw = searchParams.get("redirect")
  const passwordResetDone =
    typeof location.state === "object" &&
    location.state !== null &&
    (location.state as { reason?: string }).reason === "password-reset"

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

          {passwordResetDone ? (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              პაროლი განახლდა. შეგიძლიათ შეხვიდეთ ახალი პაროლით.
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
                <Link to="/forgot-password" className="text-xs font-semibold text-[#D4A843] hover:underline">
                  დაავიწყდა პაროლი?
                </Link>
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
          <h1 className="text-[28px] font-bold text-[#2563EB] md:text-4xl">რეგისტრაცია</h1>
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
                className="h-11 w-full rounded-lg bg-[#2563EB] text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-70"
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
  const paypalClientId = typeof import.meta.env.VITE_PAYPAL_CLIENT_ID === "string" ? import.meta.env.VITE_PAYPAL_CLIENT_ID.trim() : ""
  /** Stable object identity — PayPalScriptProvider’s effect keys off `options`; avoid reloading SDK each App re-render. */
  const paypalProviderOptions = useMemo(
    () => ({
      clientId: paypalClientId,
      currency: "USD",
      intent: "capture" as const,
    }),
    [paypalClientId],
  )
  const routes = (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/listings" element={<ListingsPage />} />
        <Route path="/listing/:id" element={<ListingDetailPage />} />
        <Route path="/cv/:slug" element={<PublicCVPage />} />
        <Route path="/hirers" element={<HirersPage />} />
        <Route path="/hirer/:id" element={<HirerPublicPage />} />
        <Route path="/freelancer/:slug" element={<FreelancerProfilePage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/job/:id" element={<JobDetailPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/forgot-password"
          element={
            <Suspense fallback={<PageLoader />}>
              <ForgotPasswordPage />
            </Suspense>
          }
        />
        <Route
          path="/auth/reset-password"
          element={
            <Suspense fallback={<PageLoader />}>
              <ResetPasswordPage />
            </Suspense>
          }
        />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/checkout" element={<PayPalCheckoutE2EPage />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cv-generator"
          element={
            <ProtectedRoute>
              <CVGeneratorPage />
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
          path="/settings"
          element={
            <ProtectedRoute>
              <ProfilePage />
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

  if (!paypalClientId) {
    return routes
  }

  return (
    <PayPalScriptProvider options={paypalProviderOptions}>
      {routes}
    </PayPalScriptProvider>
  )
}

export default App
