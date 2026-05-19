import { PayPalScriptProvider } from "@paypal/react-paypal-js"
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import { Link, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import Navbar from "./components/Navbar.tsx"
import PageLoader from "./components/ui/PageLoader.tsx"
import NotFoundPage from "./pages/NotFound.tsx"
import { isSupabaseConfigured, supabase } from "./lib/supabase"
import {
  authCooldownUntil,
  consumeAuthRateLimit,
  isAuthRateLimited,
  signInWithRateLimit,
} from "./lib/authRateLimit"
import {
  LIMITS,
  normalizeSearchInput,
  validateEmail,
  validateOptionalTextField,
  validatePassword,
  validateTextField,
} from "./lib/validation.ts"
import ProtectedRoute from "./components/ProtectedRoute.tsx"
import LocationFilterSelect from "./components/LocationFilterSelect.tsx"
import Footer from "./components/Footer.tsx"
import HomeFeedSection from "./components/HomeFeedSection.tsx"
import mainHeroImage from "../images/main.png"

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
const SavedPage = lazy(() => import("./pages/Saved.tsx"))
const MessagesPage = lazy(() => import("./pages/Messages.tsx"))

type HomeStats = {
  freelancerCount: number
  jobCount: number
  completedCount: number
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US").replace(/,/g, " ")
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

  const showStatsBar = stats.freelancerCount >= 10

  const handleSearch = () => {
    const trimmed = normalizeSearchInput(searchText)
    if (!trimmed) {
      navigate("/browse")
      return
    }
    navigate(`/browse?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <main className="page-enter">
      <Navbar />

      <section className="bg-[#0088FF]">
        <div className="mx-auto grid w-full max-w-[1200px] items-stretch gap-8 px-4 py-10 md:px-6 lg:grid-cols-2 lg:py-16">
          <div className="flex flex-col justify-center">
            <h1 className="mt-3 text-[28px] font-extrabold leading-tight text-white lg:text-[48px]">
              საუკეთესო
              <br />
              ფრილანსერები
            </h1>


            <div className="mt-8 flex flex-col gap-2 rounded-xl bg-white p-3 shadow-lg sm:flex-row sm:items-center">
              <input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSearch()
                }}
                placeholder="რას ეძებ?"
                className="h-10 min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-500 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:ring-2 focus:ring-[#0088FF]"
              />
              <button
                type="button"
                onClick={handleSearch}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-white px-8 text-base font-bold text-[#0088FF] transition hover:bg-[#E8F4FF]"
              >
                ძებნა
              </button>
            </div>
          </div>

          <div className="flex min-h-0 items-center justify-center">
            <img
              src={mainHeroImage}
              alt="გიგორი — ფრილანს პლატფორმა"
              className="h-auto w-full max-w-lg rounded-2xl object-contain drop-shadow-lg lg:max-w-none"
            />
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
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const reason = searchParams.get("reason")
  const redirectRaw = searchParams.get("redirect")
  const passwordResetDone =
    typeof location.state === "object" &&
    location.state !== null &&
    (location.state as { reason?: string }).reason === "password-reset"

  useEffect(() => {
    document.title = "შესვლა — გიგორი"
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

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase პარამეტრები ვერ მოიძებნა. შეამოწმე .env ფაილი.")
      return
    }

    const emailResult = validateEmail(email)
    if (!emailResult.ok) {
      setError(emailResult.message)
      return
    }
    const passwordResult = validatePassword(password)
    if (!passwordResult.ok) {
      setError(passwordResult.message)
      return
    }

    if (cooldownUntil && Date.now() < cooldownUntil) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000)
      setError(`ზედმეტი მცდელობები დაფიქსირდა. სცადე ${secondsLeft} წამში.`)
      return
    }

    setIsSubmitting(true)
    const { error: loginError } = await signInWithRateLimit(emailResult.value, passwordResult.value)
    setIsSubmitting(false)

    if (loginError) {
      const message = loginError.message.toLowerCase()
      if (isAuthRateLimited(loginError.status, loginError.message)) {
        setCooldownUntil(authCooldownUntil())
        setError("ზედმეტი მცდელობები დაფიქსირდა. გთხოვ, სცადე 15 წუთში.")
      } else if (message.includes("invalid login credentials")) {
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
          <h1 className="text-[28px] font-bold text-[#0088FF] md:text-4xl">ანგარიშში შესვლა</h1>

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
                <Link to="/forgot-password" className="text-xs font-semibold text-[#0088FF] hover:underline">
                  დაგავიწყდა პაროლი?
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
              disabled={isSubmitting || cooldownSeconds > 0}
              className="h-11 w-full rounded-lg bg-[#0088FF] text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#006ACC] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting
                ? "მიმდინარეობს..."
                : cooldownSeconds > 0
                  ? `სცადე ${cooldownSeconds} წამში`
                  : "შესვლა"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-600">
            ჯერ არ გაქვს ანგარიში?{" "}
            <Link to="/register" className="font-semibold text-[#0088FF] hover:underline">
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

    const fullNameResult = validateTextField(fullName, {
      min: LIMITS.fullNameMin,
      max: LIMITS.fullName,
      label: "სახელი",
    })
    if (!fullNameResult.ok) {
      setError(fullNameResult.message)
      return
    }
    const emailResult = validateEmail(email)
    if (!emailResult.ok) {
      setError(emailResult.message)
      return
    }
    const passwordResult = validatePassword(password)
    if (!passwordResult.ok) {
      setError(passwordResult.message)
      return
    }
    if (passwordResult.value !== confirmPassword) {
      setError("პაროლები ერთმანეთს არ ემთხვევა.")
      return
    }
    const cityResult = validateTextField(city, { max: LIMITS.city, label: "ქალაქი" })
    if (!cityResult.ok) {
      setError(cityResult.message)
      return
    }
    const phoneResult = validateOptionalTextField(phone, { max: LIMITS.phone, label: "ტელეფონი" })
    if (!phoneResult.ok) {
      setError(phoneResult.message)
      return
    }

    const formData = {
      full_name: fullNameResult.value,
      email: emailResult.value,
      password: passwordResult.value,
      confirm_password: confirmPassword,
      city: cityResult.value,
      phone: phoneResult.value ?? "",
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

    setIsSubmitting(true)
    registerInFlightRef.current = true
    try {
      const rateCheck = await consumeAuthRateLimit("register", formData.email)
      if (!rateCheck.ok) {
        setCooldownUntil(authCooldownUntil(rateCheck.retryAfterSeconds))
        setError(`ზედმეტი მცდელობები დაფიქსირდა. გთხოვ, სცადე ${rateCheck.retryAfterSeconds} წამში.`)
        return
      }

      const { data: signUpData, error: registerError } = await supabase.auth.signUp(signUpPayload)

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
        } else if (isAuthRateLimited(registerError.status, registerError.message)) {
          setCooldownUntil(authCooldownUntil())
          setError("ზედმეტი მცდელობები დაფიქსირდა. გთხოვ, სცადე 15 წუთში.")
        } else if (message.includes("email signups are disabled")) {
          setError("ელფოსტით რეგისტრაცია გათიშულია Supabase პროექტში.")
        } else if (message.includes("password")) {
          setError("პაროლი არ აკმაყოფილებს მოთხოვნებს.")
        } else {
          setError(`რეგისტრაცია ვერ მოხერხდა: ${registerError.message}`)
        }
        return
      }

      const newUserId = signUpData.user?.id
      if (newUserId && (formData.phone || formData.city)) {
        const profilePatch: { phone?: string | null; city?: string | null } = {}
        if (formData.phone) profilePatch.phone = formData.phone
        if (formData.city) profilePatch.city = formData.city
        const { error: profilePatchError } = await supabase
          .from("profiles")
          .update(profilePatch)
          .eq("id", newUserId)
        if (profilePatchError) {
          console.warn("Profile phone/city sync after signUp:", profilePatchError.message)
        }
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
          <h1 className="text-[28px] font-bold text-[#0088FF] md:text-4xl">რეგისტრაცია</h1>
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
                className="h-11 w-full rounded-lg bg-[#0088FF] text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#006ACC] disabled:cursor-not-allowed disabled:opacity-70"
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
        {(import.meta.env.DEV || import.meta.env.VITE_PAYPAL_E2E_DIAG === "1") ? (
          <Route path="/checkout" element={<PayPalCheckoutE2EPage />} />
        ) : null}
        <Route
          path="/saved"
          element={
            <ProtectedRoute>
              <SavedPage />
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
          path="/messages/:conversationId"
          element={
            <ProtectedRoute>
              <MessagesPage />
            </ProtectedRoute>
          }
        />
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
