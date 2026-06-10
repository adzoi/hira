import { useEffect, useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import {
  authCooldownUntil,
  isAuthRateLimited,
  signInWithRateLimit,
} from "../lib/authRateLimit"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { validateEmail, validatePasswordForLogin } from "../lib/validation.ts"
import { usePageMeta } from "../lib/usePageMeta.tsx"

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

export default function LoginPage() {
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

  const pageMeta = usePageMeta(t("auth.loginTitle"), t("auth.loginMetaDescription"))

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
    <>
      {pageMeta}
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
                  <p className="m-0 mt-0.5 text-[13px] text-[#6B7280]">{t("auth.loginForContactHint")}</p>
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
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
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
    </>
  )
}
