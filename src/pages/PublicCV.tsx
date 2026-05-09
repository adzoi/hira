import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import Navbar from "../components/Navbar"
import CVPreview from "../../components/cv/CVPreview.jsx"
import { supabaseEdgeHeaders } from "../lib/supabaseEdgeHeaders.ts"
import { supabase } from "../lib/supabase"

type CvPayload = Record<string, unknown>

export default function PublicCVPage() {
  const { slug } = useParams<{ slug: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [cv, setCv] = useState<CvPayload | null>(null)

  useEffect(() => {
    document.title = "საჯარო CV — გიგორი"
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!slug) {
        setError("CV slug ვერ მოიძებნა.")
        setLoading(false)
        return
      }
      try {
        const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cv-get?slug=${encodeURIComponent(slug)}`,
          {
            method: "GET",
            headers: supabaseEdgeHeaders(token),
          },
        )
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error || "CV ვერ მოიძებნა.")
        }
        if (!cancelled) setCv((payload?.cv ?? null) as CvPayload | null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "შეცდომა")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [slug])

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        {loading ? <p className="text-sm text-slate-600">იტვირთება...</p> : null}
        {!loading && error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}
        {!loading && !error && cv ? <CVPreview cv={cv} readOnly /> : null}
      </main>
    </div>
  )
}

