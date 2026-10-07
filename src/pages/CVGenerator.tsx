import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { getAuthenticatedSession } from "../lib/supabaseAuth.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { usePageMeta } from "../lib/usePageMeta.tsx"

/**
 * The CV is now a feature of the profile ("Download profile as CV" on /freelancer/:slug).
 * This route stays so old links and bookmarks land in the right place.
 */
export default function CVGeneratorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!isSupabaseConfigured || !supabase) {
        navigate("/", { replace: true })
        return
      }
      const { user } = await getAuthenticatedSession(supabase)
      if (cancelled) return
      if (!user) {
        navigate("/login?redirect=%2Fcv-generator", { replace: true })
        return
      }
      const { data } = await supabase.from("freelancer_profiles").select("slug").eq("user_id", user.id).maybeSingle()
      if (cancelled) return
      navigate(data?.slug ? `/freelancer/${encodeURIComponent(data.slug)}?cv=1` : "/onboarding", { replace: true })
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <>
      {usePageMeta(t("cv.generatorTitle"), t("cv.generatorMetaDescription"))}
      <div className="flex min-h-[50vh] items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#D4A843]" />
      </div>
    </>
  )
}
