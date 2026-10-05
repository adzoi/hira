import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import CVPreview from "../components/cv/CVPreview.jsx"
import { fetchCvGenerator } from "../lib/queries/fetchCvGenerator.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { useToast } from "../components/ui/ToastProvider.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { getAuthenticatedSession } from "../lib/supabaseAuth.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { usePageMeta } from "../lib/usePageMeta.tsx"

export default function CVGeneratorPage() {
  const { t } = useTranslation()
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
    ? t("validation.supabaseMissing")
    : isError
      ? queryErrorMessage(queryError, t("cv.loadFailed"))
      : ""

  const notifyCv = useMemo(() => {
    return (evt: { type: string; message: string }) => {
      const toastType =
        evt.type === "success" || evt.type === "error" || evt.type === "info" ? evt.type : ("info" as const)
      pushToast({ type: toastType, message: evt.message })
    }
  }, [pushToast])
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

    <>
    {usePageMeta(t("cv.generatorTitle"), t("cv.generatorMetaDescription"))}

    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        {loading ? <p className="text-sm text-slate-600">{t("common.loading")}</p> : null}
        {!loading && error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}

        {!loading && !error ? <CVPreview cv={cv} onNotify={notifyCv} /> : null}
      </main>
    </div>
  </>
  )
}
