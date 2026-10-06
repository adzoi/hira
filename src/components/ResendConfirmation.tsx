import { useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { consumeAuthRateLimit, isAuthRateLimited } from "../lib/authRateLimit"
import { supabase } from "../lib/supabase"
import { authEmailConfirmRedirectUrl } from "../lib/supabaseAuth.ts"

/** Button that re-sends the signup confirmation email. */
export function ResendConfirmationButton({ email }: { email: string }) {
  const { t } = useTranslation()
  const [state, setState] = useState<"idle" | "busy" | "sent" | "limited" | "failed">("idle")

  const resend = async () => {
    if (!supabase || !email) return
    setState("busy")
    const rateCheck = await consumeAuthRateLimit("register", email)
    if (!rateCheck.ok) {
      setState("limited")
      return
    }
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: authEmailConfirmRedirectUrl() },
    })
    if (error) {
      setState(isAuthRateLimited(error.status, error.message) ? "limited" : "failed")
      return
    }
    setState("sent")
  }

  return (
    <div className="mt-3 text-sm">
      <button
        type="button"
        disabled={state === "busy" || state === "sent"}
        onClick={() => void resend()}
        className="font-semibold text-[#0088FF] hover:underline disabled:cursor-default disabled:text-slate-400 disabled:no-underline"
      >
        {state === "busy" ? t("common.inProgress") : t("auth.resendConfirmation")}
      </button>
      {state === "sent" ? <p className="mt-1 text-emerald-700">{t("auth.confirmationResent")}</p> : null}
      {state === "limited" ? <p className="mt-1 text-red-600">{t("validation.rateLimited")}</p> : null}
      {state === "failed" ? <p className="mt-1 text-red-600">{t("auth.requestFailed")}</p> : null}
    </div>
  )
}

/** Shown after signup when the account still needs its email confirmed. */
export default function CheckEmailPanel({ email }: { email: string }) {
  const { t } = useTranslation()
  return (
    <div className="mt-7 rounded-xl border border-[#0088FF]/30 bg-sky-50 p-5 text-[#1B2B4B]">
      <p className="text-3xl">📩</p>
      <h2 className="mt-2 text-xl font-bold">{t("auth.checkEmailHeading")}</h2>
      <p className="mt-2 text-sm leading-6">
        {t("auth.checkEmailBody")} <span className="font-semibold break-all">{email}</span>
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{t("auth.checkEmailSpam")}</p>
      <ResendConfirmationButton email={email} />
      <p className="mt-4 text-sm">
        <Link to="/login" className="font-semibold text-[#D4A843] hover:underline">
          {t("auth.checkEmailToLogin")}
        </Link>
      </p>
    </div>
  )
}
