import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import type { User } from "@supabase/supabase-js"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { AUTH_ONBOARDING_PATH, AUTH_ONBOARDING_URL } from "../lib/supabaseAuth.ts"
import { usePageMeta } from "../lib/usePageMeta.tsx"

function isEmailConfirmed(user: User): boolean {
  return Boolean(user.email_confirmed_at ?? user.confirmed_at)
}

export default function AuthConfirmPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState("")

  const pageMeta = usePageMeta(t("auth.confirmTitle"), t("auth.confirmMetaDescription"))

  useEffect(() => {
    const client = supabase
    if (!isSupabaseConfigured || !client) {
      navigate("/login", { replace: true })
      return
    }

    let cancelled = false

    const finish = async (): Promise<boolean> => {
      const {
        data: { user },
        error: userError,
      } = await client.auth.getUser()
      if (cancelled) return true
      if (userError) {
        setError(userError.message)
        return false
      }
      if (user && isEmailConfirmed(user)) {
        window.location.replace(AUTH_ONBOARDING_URL)
        return true
      }
      return false
    }

    const { data: authListener } = client.auth.onAuthStateChange((event) => {
      if (cancelled) return
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        void finish()
      }
    })

    void (async () => {
      const searchParams = new URLSearchParams(window.location.search)
      const code = searchParams.get("code")
      if (code) {
        const { error: exchangeError } = await client.auth.exchangeCodeForSession(window.location.href)
        if (cancelled) return
        if (exchangeError) {
          setError(exchangeError.message)
          return
        }
        window.history.replaceState(null, "", AUTH_ONBOARDING_PATH)
        if (await finish()) return
      }

      if (await finish()) return

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""))
      const hashError = hashParams.get("error_description") ?? hashParams.get("error")
      if (hashError) {
        setError(decodeURIComponent(hashError.replace(/\+/g, " ")))
        return
      }
    })()

    const timeoutId = window.setTimeout(() => {
      if (cancelled) return
      void finish().then((done) => {
        if (!done && !cancelled) {
          navigate("/login?reason=confirm-email", { replace: true })
        }
      })
    }, 3000)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      authListener.subscription.unsubscribe()
    }
  }, [navigate])

  return (
    <>
      {pageMeta}
      <div className="min-h-screen bg-[#F8F9FC] page-enter">
        <div className="mx-auto w-full max-w-xl px-4 py-16 text-center">
          {error ? (
            <div className="space-y-3 text-sm text-slate-700">
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</p>
              <Link to="/login" className="font-semibold text-[#D4A843] hover:underline">
                {t("auth.backToLogin")}
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-600">{t("auth.confirmingEmail")}</p>
          )}
        </div>
      </div>
    </>
  )
}
