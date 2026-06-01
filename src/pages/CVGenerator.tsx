import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import Navbar from "../components/Navbar"
import CVPreview from "../../components/cv/CVPreview.jsx"
import { fetchCvGenerator } from "../lib/queries/fetchCvGenerator.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { useToast } from "../components/ui/ToastProvider.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { getAuthenticatedSession } from "../lib/supabaseAuth.ts"

export default function CVGeneratorPage() {
  const navigate = useNavigate()
  const { pushToast } = useToast()
  const [userId, setUserId] = useState("")
  const {
    data: cv = {},
    isLoading: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.cvGenerator(userId),
    queryFn: () => fetchCvGenerator(userId),
    enabled: Boolean(userId),
  })
  const error = !isSupabaseConfigured
    ? "Supabase არ არის კონფიგურირებული."
    : isError
      ? queryErrorMessage(queryError, "CV-ის ჩატვირთვა ვერ მოხერხდა.")
      : ""

  const notifyCv = useMemo(() => {
    return (evt: { type: string; message: string }) => {
      const t =
        evt.type === "success" || evt.type === "error" || evt.type === "info" ? evt.type : ("info" as const)
      pushToast({ type: t, message: evt.message })
    }
  }, [pushToast])

  useEffect(() => {
    document.title = "CV გენერატორი — გიგორი"
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!isSupabaseConfigured || !supabase) return
      const { user, session } = await getAuthenticatedSession(supabase)
      if (cancelled) return
      if (!user || !session?.access_token) {
        navigate("/login?redirect=%2Fcv-generator")
        return
      }
      setUserId(user.id)
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        {loading ? <p className="text-sm text-slate-600">იტვირთება...</p> : null}
        {!loading && error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}

        {!loading && !error ? <CVPreview cv={cv} onNotify={notifyCv} /> : null}
      </main>
    </div>
  )
}
