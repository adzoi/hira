import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import Navbar from "../components/Navbar"
import CVPreview from "../../components/cv/CVPreview.jsx"
import { buildCvFromProfileData } from "../lib/cvFromProfile.ts"
import { useToast } from "../components/ui/ToastProvider.tsx"
import { supabaseEdgeHeaders } from "../lib/supabaseEdgeHeaders.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"

type CvPayload = Record<string, unknown>

export default function CVGeneratorPage() {
  const navigate = useNavigate()
  const { pushToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [cv, setCv] = useState<CvPayload>({})

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
    const load = async () => {
      if (!isSupabaseConfigured || !supabase) {
        if (!cancelled) {
          setError("Supabase არ არის კონფიგურირებული.")
          setLoading(false)
        }
        return
      }
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          navigate("/login?redirect=%2Fcv-generator")
          return
        }

        const session = (await supabase.auth.getSession()).data.session
        if (!session?.access_token) {
          navigate("/login?redirect=%2Fcv-generator")
          return
        }

        const [fpRes, profileRes, cvResponse] = await Promise.all([
          supabase.from("freelancer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
          supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cv-get`, {
            method: "GET",
            headers: supabaseEdgeHeaders(session.access_token),
          }),
        ])

        if (cancelled) return

        let savedCv: Record<string, unknown> | null = null
        const fpRow = fpRes.data as Record<string, unknown> | null
        if (cvResponse.ok) {
          const payload = await cvResponse.json().catch(() => null)
          const maybeCv = payload?.cv
          const hasRealCvObject = Boolean(
            maybeCv && typeof maybeCv === "object" && typeof (maybeCv as { id?: string }).id === "string" && String((maybeCv as { id: string }).id).trim(),
          )
          if (hasRealCvObject) savedCv = maybeCv as Record<string, unknown>
        }

        const fpId = fpRow && typeof fpRow.id === "string" ? fpRow.id : null

        let experienceRows: Array<Record<string, unknown>> = []
        let educationRows: Array<Record<string, unknown>> = []
        let skillNames: string[] = []

        if (fpId) {
          const [expRes, eduRes, fsRes] = await Promise.all([
            supabase.from("experience").select("*").eq("freelancer_profile_id", fpId).order("start_date", { ascending: false }),
            supabase
              .from("freelancer_education")
              .select("*")
              .eq("freelancer_profile_id", fpId)
              .order("end_date", { ascending: false }),
            supabase.from("freelancer_skills").select("skills(name)").eq("freelancer_profile_id", fpId),
          ])
          if (!cancelled) {
            experienceRows = (expRes.data ?? []) as Array<Record<string, unknown>>
            educationRows = (eduRes.data ?? []) as Array<Record<string, unknown>>
            const fsRows = fsRes.data ?? []
            skillNames = (
              fsRows as Array<{ skills?: { name?: string } | null }>
            )
              .map((row) => row?.skills?.name)
              .filter((n): n is string => Boolean(n && String(n).trim()))
              .map((n) => String(n).trim())
          }
        }

        if (cancelled) return

        const built = buildCvFromProfileData({
          freelancerProfile: fpRow,
          profile: profileRes.data as Record<string, unknown> | null,
          experienceRows,
          educationRows,
          skillNames,
          savedCv,
        })

        setCv(built as CvPayload)
      } catch {
        if (!cancelled) {
          setError("CV-ის ჩატვირთვა ვერ მოხერხდა.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
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
