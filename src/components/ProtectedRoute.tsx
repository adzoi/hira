import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import type { User } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"

export default function ProtectedRoute({ children }: { children: ReactNode }) {
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
      setUser(error ? null : currentUser)
      setLoading(false)
      if (error || !currentUser) navigate("/login")
    }

    checkSession()
    return () => {
      mounted = false
    }
  }, [navigate])

  if (loading) return <div className="p-6 text-center">იტვირთება...</div>
  return user ? <>{children}</> : null
}
