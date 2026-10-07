import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import LocationFilterSelect from "../components/LocationFilterSelect.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import {
  clearOAuthReturnState,
  markRoleConfirmed,
  needsRoleSelection,
  readOAuthReturnState,
} from "../lib/oauth.ts"
import { clearStoredReferralCode } from "../lib/referral.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { AUTH_ONBOARDING_PATH } from "../lib/supabaseAuth.ts"
import { usePageMeta } from "../lib/usePageMeta.tsx"
import { validateOptionalTextField, validateTextField, LIMITS } from "../lib/validation.ts"

/** Provider errors come back as ?error_description= or #error_description=. */
function providerErrorFromUrl(): string | null {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""))
  const raw =
    search.get("error_description") ?? hash.get("error_description") ?? search.get("error") ?? hash.get("error")
  return raw ? decodeURIComponent(raw.replace(/\+/g, " ")) : null
}

export default function AuthCallbackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [status, setStatus] = useState<"loading" | "choose-role" | "error">("loading")
  const [error, setError] = useState("")
  const [userId, setUserId] = useState("")
  const [userType, setUserType] = useState<"freelancer" | "hirer" | null>(null)
  const [city, setCity] = useState("")
  const [phone, setPhone] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const pageMeta = usePageMeta(t("auth.chooseRoleTitle"), t("auth.registerMetaDescription"))

  useEffect(() => {
    const client = supabase
    if (!isSupabaseConfigured || !client) {
      navigate("/login", { replace: true })
      return
    }
    let cancelled = false

    void (async () => {
      const providerError = providerErrorFromUrl()
      // getSession waits for the SDK to finish reading the tokens from the URL.
      const {
        data: { session },
      } = await client.auth.getSession()
      if (cancelled) return
      if (!session) {
        setError(providerError ?? t("auth.oauthFailed"))
        setStatus("error")
        return
      }
      window.history.replaceState(null, "", window.location.pathname)

      if (await needsRoleSelection(session.user)) {
        if (cancelled) return
        setUserId(session.user.id)
        setStatus("choose-role")
        return
      }
      if (cancelled) return
      const { next } = readOAuthReturnState()
      clearOAuthReturnState()
      navigate(next ?? "/dashboard", { replace: true })
    })()

    return () => {
      cancelled = true
    }
  }, [navigate])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    if (!supabase) return
    if (!userType) {
      setError(t("auth.chooseRoleRequired"))
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

    setSubmitting(true)
    const { referralCode } = readOAuthReturnState()
    const { error: rpcError } = await supabase.rpc("set_initial_role", {
      p_user_type: userType,
      p_city: cityResult.value,
      p_phone: phoneResult.value ?? undefined,
      p_referral_code: referralCode ?? undefined,
    })
    setSubmitting(false)

    // A second tab may have finished first; the role is set either way.
    if (rpcError && !rpcError.message.includes("ROLE_ALREADY_SET")) {
      setError(t("auth.chooseRoleFailed"))
      return
    }
    markRoleConfirmed(userId)
    clearOAuthReturnState()
    clearStoredReferralCode()
    navigate(AUTH_ONBOARDING_PATH, { replace: true })
  }

  const roleButtonClass = (selected: boolean) =>
    `rounded-xl border-2 p-5 text-left transition hover:border-[#D4A843] hover:bg-amber-50 ${
      selected ? "border-[#D4A843] bg-amber-50" : "border-slate-200"
    }`

  return (
    <>
      {pageMeta}
      <div className="min-h-screen bg-[#F8F9FC] page-enter">
        <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6 md:py-14">
          {status === "loading" ? (
            <p className="py-6 text-center text-sm text-slate-600">{t("auth.oauthSigningIn")}</p>
          ) : status === "error" ? (
            <div className="space-y-3 py-6 text-center text-sm text-slate-700">
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</p>
              <Link to="/login" className="font-semibold text-[#D4A843] hover:underline">
                {t("auth.backToLogin")}
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-8">
              <h1 className="text-[28px] font-bold text-[#0088FF] md:text-4xl">{t("auth.chooseRoleHeading")}</h1>
              <p className="mt-2 text-sm text-slate-500">{t("auth.chooseRoleHint")}</p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={userType === "freelancer"}
                    onClick={() => setUserType("freelancer")}
                    className={roleButtonClass(userType === "freelancer")}
                  >
                    <p className="text-xl font-bold text-[#1B2B4B]">{t("auth.freelancer")}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{t("auth.freelancerDesc")}</p>
                  </button>
                  <button
                    type="button"
                    aria-pressed={userType === "hirer"}
                    onClick={() => setUserType("hirer")}
                    className={roleButtonClass(userType === "hirer")}
                  >
                    <p className="text-xl font-bold text-[#1B2B4B]">{t("auth.hirer")}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{t("auth.hirerDesc")}</p>
                  </button>
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
                    <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("auth.phoneOptional")}</span>
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
                  disabled={submitting}
                  className="h-11 w-full rounded-lg bg-[#0088FF] text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#006ACC] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? t("common.inProgress") : t("auth.continue")}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
