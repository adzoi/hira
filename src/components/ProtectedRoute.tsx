import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { User } from "@supabase/supabase-js"
import { needsRoleSelection, OAUTH_CALLBACK_PATH } from "../lib/oauth.ts"
import { supabase } from "../lib/supabase"
import { useTranslation } from "../i18n/LocaleContext.tsx"

function isEmailConfirmed(user: User): boolean {
  return Boolean(user.email_confirmed_at ?? user.confirmed_at)
}

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true
    const checkSession = async () => {
      if (!supabase) {
        if (mounted) {
          setUser(null)
          setLoading(false)
          navigate("/login")
        }
        return
      }
      const {
        data: { user: currentUser },
        error,
      } = await supabase.auth.getUser()
      if (!mounted) return
      if (error || !currentUser) {
        setUser(null)
        setLoading(false)
        navigate("/login")
        return
      }
      if (!isEmailConfirmed(currentUser)) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {})
        setUser(null)
        setLoading(false)
        navigate("/login?reason=confirm-email")
        return
      }
      if (await needsRoleSelection(currentUser)) {
        if (!mounted) return
        setLoading(false)
        navigate(OAUTH_CALLBACK_PATH, { replace: true })
        return
      }
      if (!mounted) return
      setUser(currentUser)
      setLoading(false)
    }

    checkSession()
    return () => {
      mounted = false
    }
  }, [navigate])

  if (loading) return <div className="p-6 text-center">{t("protected.redirecting")}</div>
  return user ? <>{children}</> : null
}
