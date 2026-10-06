import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import LocationFilterSelect from "../components/LocationFilterSelect.tsx"
import CheckEmailPanel from "../components/ResendConfirmation.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import {
  authCooldownUntil,
  retryAfterFromAuthMessage,
  consumeAuthRateLimit,
  isAuthRateLimited,
} from "../lib/authRateLimit"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { authEmailConfirmRedirectUrl } from "../lib/supabaseAuth.ts"
import {
  LIMITS,
  validateEmail,
  validateOptionalTextField,
  validatePassword,
  validateTextField,
} from "../lib/validation.ts"
import { usePageMeta } from "../lib/usePageMeta.tsx"
import { captureReferralFromUrl, clearStoredReferralCode, storedReferralCode } from "../lib/referral.ts"

export default function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [referralCode] = useState(() => {
    captureReferralFromUrl(location.search)
    return storedReferralCode()
  })
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
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null)

  const pageMeta = usePageMeta(t("auth.registerTitle"), t("auth.registerMetaDescription"))

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
        emailRedirectTo: authEmailConfirmRedirectUrl(),
        data: {
          full_name: formData.full_name,
          user_type: formData.user_type,
          city: formData.city,
          phone: formData.phone,
          ...(referralCode ? { referral_code: referralCode } : {}),
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
          setError(t("auth.emailAlreadyRegistered"))
        } else if (message.includes("invalid email")) {
          setError(t("validation.emailInvalid"))
        } else if (isAuthRateLimited(registerError.status, registerError.message)) {
          setCooldownUntil(authCooldownUntil(retryAfterFromAuthMessage(registerError.message)))
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

      // Supabase hides existing accounts: it "succeeds" with no session and no identities.
      if (signUpData.user && !signUpData.session && signUpData.user.identities?.length === 0) {
        setError(t("auth.emailAlreadyRegistered"))
        return
      }

      clearStoredReferralCode()
      const newUserId = signUpData.user?.id
      const session = signUpData.session
      const emailConfirmed = Boolean(signUpData.user?.email_confirmed_at ?? signUpData.user?.confirmed_at)

      if (!session || !emailConfirmed) {
        setConfirmationSentTo(formData.email)
        window.scrollTo({ top: 0 })
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
    <>
      {pageMeta}
      <div className="min-h-screen bg-[#F8F9FC] page-enter">
        <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6 md:py-14">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-8">
            <h1 className="text-[28px] font-bold text-[#0088FF] md:text-4xl">{t("auth.registerHeading")}</h1>
            {confirmationSentTo ? null : <p className="mt-2 text-sm text-slate-500">{t("auth.registerStep", { step })}</p>}
            {referralCode && !confirmationSentTo ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-[#1B2B4B]">{t("referral.invitedBanner")}</p>
            ) : null}

            {confirmationSentTo ? (
              <CheckEmailPanel email={confirmationSentTo} />
            ) : step === 1 ? (
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
                  <p className="mt-2 text-sm leading-6 text-slate-600">{t("auth.freelancerDesc")}</p>
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
                  <p className="mt-2 text-sm leading-6 text-slate-600">{t("auth.hirerDesc")}</p>
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
                  <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("common.password")}</span>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="new-password"
                        className="h-11 w-full rounded-lg border border-slate-300 px-3 pr-24 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-slate-500"
                      >
                        {showPassword ? t("common.hide") : t("common.show")}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{t("auth.passwordMinPlaceholder")}</p>
                  </label>
                  <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                      {t("auth.confirmPassword")}
                    </span>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        autoComplete="new-password"
                        className="h-11 w-full rounded-lg border border-slate-300 px-3 pr-24 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-slate-500"
                      >
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
    </>
  )
}
