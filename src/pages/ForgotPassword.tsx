import type { FormEvent } from "react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import {
  authCooldownUntil,
  consumeAuthRateLimit,
  isAuthRateLimited,
} from "../lib/authRateLimit"
import { validateEmail } from "../lib/validation.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { usePageMeta } from "../lib/usePageMeta.tsx"

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")

    if (!isSupabaseConfigured || !supabase) {
      setError(t("validation.supabaseMissing"))
      return
    }

    const emailResult = validateEmail(email)
    if (!emailResult.ok) {
      setError(emailResult.message)
      return
    }
    const trimmed = emailResult.value

    if (cooldownUntil && Date.now() < cooldownUntil) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000)
      setError(t("validation.rateLimitedSeconds", { seconds: secondsLeft }))
      return
    }

    setBusy(true)
    try {
      const rateCheck = await consumeAuthRateLimit("recover", trimmed)
      if (!rateCheck.ok) {
        setCooldownUntil(authCooldownUntil(rateCheck.retryAfterSeconds))
        setError(t("validation.rateLimitedSeconds", { seconds: rateCheck.retryAfterSeconds }))
        return
      }

      const redirectTo = `${window.location.origin}/auth/reset-password`
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo })
      if (resetErr) {
        if (isAuthRateLimited(resetErr.status, resetErr.message)) {
          setCooldownUntil(authCooldownUntil())
          throw new Error(t("validation.rateLimited"))
        }
        throw resetErr
      }
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.requestFailed"))
    } finally {
      setBusy(false)
    }
  }

  return (

    <>
    {usePageMeta(t("auth.forgotTitle"), t("auth.forgotMetaDescription"))}

    <div className="min-h-screen bg-[#F8F9FC] page-enter">
      <Navbar />
      <div className="mx-auto w-full max-w-xl px-4 py-10 md:px-6 md:py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-8">
          <h1 className="text-[26px] font-bold text-[#1B2B4B] md:text-4xl">{t("auth.forgotHeading")}</h1>
          <p className="mt-2 text-sm text-slate-600">{t("auth.forgotHintLong")}</p>

          {sent ? (
            <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {t("auth.linkSentLong")}
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("common.email")}</span>
                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                  placeholder="user@hira.ge"
                />
              </label>
              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              ) : null}
              <button
                type="submit"
                disabled={busy || cooldownSeconds > 0}
                className="h-11 w-full rounded-lg bg-[#1B2B4B] text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busy
                  ? t("common.inProgress")
                  : cooldownSeconds > 0
                    ? t("auth.tryAgainIn", { seconds: cooldownSeconds })
                    : t("auth.sendLink")}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-600">
            <Link to="/login" className="font-semibold text-[#D4A843] hover:underline">
              {t("auth.backToLogin")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  </>
  )
}
