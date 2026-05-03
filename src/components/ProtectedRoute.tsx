import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true
    const checkSession = async () => {
      if (!supabase) {
        if (mounted) {
          setSession(null)
          setLoading(false)
          navigate("/login")
        }
        return
      }
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(currentSession)
      setLoading(false)
      if (!currentSession) navigate("/login")
    }

    checkSession()
    return () => {
      mounted = false
    }
  }, [navigate])

  if (loading) return <div className="p-6 text-center">იტვირთება...</div>
  return session ? <>{children}</> : null
}
