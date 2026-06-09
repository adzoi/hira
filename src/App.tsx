import { Suspense, lazy, useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { Link, Outlet, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom"
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
  validatePasswordForLogin,
  validateTextField,
} from "./lib/validation.ts"
import ProtectedRoute from "./components/ProtectedRoute.tsx"
import LocationFilterSelect from "./components/LocationFilterSelect.tsx"
import CookieBanner from "./components/CookieBanner.tsx"
import Footer from "./components/Footer.tsx"
import HomeFeedSection from "./components/HomeFeedSection.tsx"
import { useHomeStatsQuery } from "./lib/queries/useHomeStatsQuery.ts"
import { useTranslation } from "./i18n/LocaleContext.tsx"
import { usePageMeta } from "./lib/usePageMeta.ts"
import mainHeroImage from "../images/main.webp"

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
const AboutPage = lazy(() => import("./pages/About.tsx"))
const TermsPage = lazy(() => import("./pages/Terms.tsx"))
const PrivacyPage = lazy(() => import("./pages/Privacy.tsx"))
const CookiesPage = lazy(() => import("./pages/Cookies.tsx"))
const GuidePage = lazy(() => import("./pages/Guide.tsx"))
const FaqPage = lazy(() => import("./pages/Faq.tsx"))
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPassword.tsx"))
const ResetPasswordPage = lazy(() => import("./pages/ResetPassword.tsx"))
const PayPalCheckoutE2EPage = lazy(() => import("./pages/PayPalCheckoutE2E.tsx"))
const SavedPage = lazy(() => import("./pages/Saved.tsx"))
const MessagesPage = lazy(() => import("./pages/Messages.tsx"))

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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState("")
  const [viewerType, setViewerType] = useState<"freelancer" | "hirer" | null>(null)
  const { data: stats = { freelancerCount: 0, jobCount: 0, completedCount: 0 } } = useHomeStatsQuery()
  usePageMeta(t("home.title"), t("home.metaDescription"))

  useEffect(() => {
    let cancelled = false
    const loadViewerType = async () => {
      if (!isSupabaseConfigured || !supabase) return
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (cancelled || !user) return
      const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", user.id).maybeSingle()
      if (cancelled) return
      const ut = profile?.user_type
      if (ut === "freelancer" || ut === "hirer") setViewerType(ut)
    }
    void loadViewerType()
    return () => {
      cancelled = true
    }
  }, [])

  const showStatsBar = stats.freelancerCount >= 10

  const handleSearch = () => {
    const trimmed = normalizeSearchInput(searchText)
    const searchPath = viewerType === "freelancer" ? "/jobs" : "/listings"
    if (!trimmed) {
      navigate(searchPath)
      return
    }
    navigate(`${searchPath}?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <main className="page-enter">
      <section className="bg-[#0088FF]">
        <div className="mx-auto grid w-full max-w-[1200px] items-stretch gap-8 px-4 py-10 md:px-6 lg:grid-cols-2 lg:py-16">
          <div className="flex flex-col justify-center">
            <h1 className="home-hero-title mt-3">
              <span className="block text-[36px] font-bold tracking-tight text-[#D4A843] drop-shadow-sm lg:text-[58px]">
                {t("home.heroBrand")}
              </span>
              <span className="mt-1 block text-[22px] font-bold text-white lg:mt-2 lg:text-[38px]">
                {t("home.heroTagline")}
              </span>
            </h1>


            <div className="mt-8 flex flex-row items-center gap-2 rounded-xl bg-white p-3 shadow-lg">
              <input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSearch()
                }}
                placeholder={t("home.searchPlaceholder")}
                className="h-10 min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-500 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:ring-2 focus:ring-[#0088FF]"
              />
              <button
                type="button"
                onClick={handleSearch}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-white px-4 text-sm font-bold text-[#0088FF] transition hover:bg-[#E8F4FF] sm:px-8 sm:text-base"
              >
                {t("common.search")}
              </button>
            </div>
          </div>

          <div className="hidden min-h-0 items-center justify-center md:flex">
            <img
              src={mainHeroImage}
              alt={`${t("brand.name")} — ${t("brand.taglineShort")}`}
              width={1024}
              height={684}
              loading="eager"
              fetchPriority="high"
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
                {stats.freelancerCount > 0 ? formatNumber(stats.freelancerCount) : t("home.growingDaily")}
              </p>
              <p className="mt-1 text-sm text-slate-500">{t("home.registeredFreelancers")}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-[#1B2B4B]">
                {stats.jobCount > 0 ? formatNumber(stats.jobCount) : t("home.growingDaily")}
              </p>
              <p className="mt-1 text-sm text-slate-500">{t("home.postedListings")}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-[#1B2B4B]">
                {stats.completedCount > 0 ? formatNumber(stats.completedCount) : t("home.growingDaily")}
              </p>
              <p className="mt-1 text-sm text-slate-500">{t("home.completedJobs")}</p>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  )
}

function LoginPage() {
  const { t } = useTranslation()
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

  usePageMeta(t("auth.loginTitle"), t("auth.loginMetaDescription"))

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
      setError(t("validation.supabaseMissing"))
      return
    }

    const emailResult = validateEmail(email)
    if (emailResult.ok === false) {
      setError(emailResult.message)
      return
    }
    const passwordResult = validatePasswordForLogin(password)
    if (passwordResult.ok === false) {
      setError(passwordResult.message)
      return
    }

    if (cooldownUntil && Date.now() < cooldownUntil) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000)
      setError(t("validation.rateLimitedSeconds", { seconds: secondsLeft }))
      return
    }

    setIsSubmitting(true)
    const { error: loginError } = await signInWithRateLimit(emailResult.value, passwordResult.value)
    setIsSubmitting(false)

    if (loginError) {
      const message = loginError.message.toLowerCase()
      if (isAuthRateLimited(loginError.status, loginError.message)) {
        setCooldownUntil(authCooldownUntil())
        setError(t("validation.rateLimited"))
      } else if (message.includes("email not confirmed")) {
        setError(t("validation.emailNotConfirmed"))
      } else if (message.includes("invalid login credentials")) {
        setError(t("validation.invalidCredentials"))
      } else if (message.includes("invalid email")) {
        setError(t("validation.emailInvalid"))
      } else {
        setError(t("validation.loginFailed"))
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
      <div className="mx-auto w-full max-w-xl px-4 py-10 md:px-6 md:py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-8">
          <h1 className="text-[28px] font-bold text-[#0088FF] md:text-4xl">{t("auth.loginHeading")}</h1>

          {reason === "post-job" ? (
            <div className="mt-5 flex items-center gap-3 rounded-lg border border-[#D4A843] bg-[#FFF8E7] px-4 py-3">
              <span className="text-xl">💼</span>
              <div>
                <p className="m-0 font-medium text-[#1B2B4B]">{t("auth.loginForPostJob")}</p>
                <p className="m-0 mt-0.5 text-[13px] text-[#6B7280]">
                  <Link to="/register" className="text-[#D4A843] hover:underline">
                    {t("auth.noAccountSignup")}
                  </Link>
                </p>
              </div>
            </div>
          ) : null}

          {reason === "contact" ? (
            <div className="mt-5 flex items-center gap-3 rounded-lg border border-[#D4A843] bg-[#FFF8E7] px-4 py-3">
              <span className="text-xl">📇</span>
              <div>
                <p className="m-0 font-medium text-[#1B2B4B]">{t("auth.loginForContact")}</p>
                <p className="m-0 mt-0.5 text-[13px] text-[#6B7280]">
                  {t("auth.loginForContactHint")}
                </p>
              </div>
            </div>
          ) : null}

          {passwordResetDone ? (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {t("auth.passwordUpdated")}
            </div>
          ) : null}

          {reason === "confirm-email" ? (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t("validation.emailNotConfirmed")}
            </div>
          ) : null}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("common.email")}</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                placeholder="მაგ: user@hira.ge"
              />
            </label>

            <label className="block">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#1B2B4B]">{t("common.password")}</span>
                <Link to="/forgot-password" className="text-xs font-semibold text-[#0088FF] hover:underline">
                  {t("auth.forgotPassword")}
                </Link>
              </div>
              <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 px-3 pr-12 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                placeholder={t("auth.enterPassword")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-slate-500"
              >
                {showPassword ? t("common.hide") : t("common.show")}
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
                ? t("common.inProgress")
                : cooldownSeconds > 0
                  ? t("auth.tryAgainIn", { seconds: cooldownSeconds })
                  : t("nav.login")}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-600">
            {t("auth.noAccountYet")}{" "}
            <Link to="/register" className="font-semibold text-[#0088FF] hover:underline">
              {t("nav.register")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function RegisterPage() {
  const { t } = useTranslation()
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

  usePageMeta(t("auth.registerTitle"), t("auth.registerMetaDescription"))

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
      setError(t("validation.supabaseMissing"))
      return
    }

    if (cooldownUntil && Date.now() < cooldownUntil) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000)
      setError(t("validation.rateLimitedSeconds", { seconds: secondsLeft }))
      return
    }

    if (!userType) {
      setError(t("validation.selectAccountType"))
      return
    }

    const fullNameResult = validateTextField(fullName, {
      min: LIMITS.fullNameMin,
      max: LIMITS.fullName,
      label: t("common.fullName"),
    })
    if (fullNameResult.ok === false) {
      setError(fullNameResult.message)
      return
    }
    const emailResult = validateEmail(email)
    if (emailResult.ok === false) {
      setError(emailResult.message)
      return
    }
    const passwordResult = validatePassword(password)
    if (passwordResult.ok === false) {
      setError(passwordResult.message)
      return
    }
    if (passwordResult.value !== confirmPassword) {
      setError(t("validation.passwordsMismatch"))
      return
    }
    const cityResult = validateTextField(city, { max: LIMITS.city, label: t("common.city") })
    if (cityResult.ok === false) {
      setError(cityResult.message)
      return
    }
    const phoneResult = validateOptionalTextField(phone, { max: LIMITS.phone, label: t("common.phone") })
    if (phoneResult.ok === false) {
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
      if (rateCheck.ok === false) {
        setCooldownUntil(authCooldownUntil(rateCheck.retryAfterSeconds))
        setError(t("validation.rateLimitedSeconds", { seconds: rateCheck.retryAfterSeconds }))
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
          setError(t("validation.emailInvalid"))
        } else if (isAuthRateLimited(registerError.status, registerError.message)) {
          setCooldownUntil(authCooldownUntil())
          setError(t("validation.rateLimited"))
        } else if (message.includes("email signups are disabled")) {
          setError("ელფოსტით რეგისტრაცია გათიშულია Supabase პროექტში.")
        } else if (message.includes("password")) {
          setError("პაროლი არ აკმაყოფილებს მოთხოვნებს.")
        } else {
          setError(t("validation.registerFailed"))
        }
        return
      }

      const newUserId = signUpData.user?.id
      const session = signUpData.session
      const emailConfirmed = Boolean(signUpData.user?.email_confirmed_at ?? signUpData.user?.confirmed_at)

      if (!session || !emailConfirmed) {
        navigate("/login?reason=confirm-email")
        return
      }

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
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6 md:py-14">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-8">
          <h1 className="text-[28px] font-bold text-[#0088FF] md:text-4xl">{t("auth.registerHeading")}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {t("auth.registerStep", { step })}
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
                <p className="text-xl font-bold text-[#1B2B4B]">{t("auth.freelancer")}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t("auth.freelancerDesc")}
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
                <p className="text-xl font-bold text-[#1B2B4B]">{t("auth.hirer")}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t("auth.hirerDesc")}
                </p>
              </button>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="mt-7 space-y-4">
              <div className="rounded-lg border border-[#D4A843]/40 bg-amber-50 px-4 py-2 text-sm text-[#1B2B4B]">
                {t("auth.selectedType")}{" "}
                <span className="font-semibold">
                  {userType === "freelancer" ? t("auth.freelancer") : t("auth.hirer")}
                </span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="ml-3 font-semibold text-[#D4A843] hover:underline"
                >
                  {t("common.change")}
                </button>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("common.fullName")}</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("common.email")}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("common.password")}</span>
                  <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 pr-12 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                  />
                  <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-slate-500">
                    {showPassword ? t("common.hide") : t("common.show")}
                  </button>
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                    {t("auth.confirmPassword")}
                  </span>
                  <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 pr-12 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                  />
                  <button type="button" onClick={() => setShowConfirmPassword((prev) => !prev)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-slate-500">
                    {showConfirmPassword ? t("common.hide") : t("common.show")}
                  </button>
                  </div>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("common.city")}</span>
                  <LocationFilterSelect
                    value={city}
                    onChange={setCity}
                    variant="form"
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                    {t("auth.phoneOptional")}
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
                  ? t("common.inProgress")
                  : cooldownSeconds > 0
                    ? t("auth.tryAgainIn", { seconds: cooldownSeconds })
                    : t("nav.register")}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-600">
            {t("auth.alreadyHaveAccount")}{" "}
            <Link to="/login" className="font-semibold text-[#D4A843] hover:underline">
              {t("nav.login")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function MainLayout() {
  const location = useLocation()
  const isMobileChatThread = /^\/messages\/[^/]+$/.test(location.pathname)
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
  )

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  return (
    <>
      {!(isMobileChatThread && isMobile) && <Navbar />}
      <Outlet />
    </>
  )
}

function ScrollToTopOnRouteChange() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
  }, [location.pathname, location.search, location.hash])

  return null
}

function App() {
  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <ScrollToTopOnRouteChange />
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/browse" element={<BrowsePage />} />
            <Route path="/listings" element={<ListingsPage />} />
            <Route path="/listing/:id" element={<ListingDetailPage />} />
            <Route path="/cv/:slug" element={<PublicCVPage />} />
            <Route path="/hirers" element={<HirersPage />} />
            <Route path="/hirer/:id" element={<HirerPublicPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/cookies" element={<CookiesPage />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/faq" element={<FaqPage />} />
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
                  <OnboardingPageStandalone />
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
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <Footer />
      <CookieBanner />
    </>
  )
}

export default App
