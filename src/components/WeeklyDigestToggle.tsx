import { useEffect, useState } from "react"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { supabase } from "../lib/supabase"

/** Settings switch for the weekly "new jobs in your field" email. */
export default function WeeklyDigestToggle({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    if (!supabase) return
    void supabase
      .from("profiles")
      .select("weekly_digest_enabled")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        // Column missing (migration not applied yet) → keep the switch hidden.
        if (!cancelled && data && typeof data.weekly_digest_enabled === "boolean") setEnabled(data.weekly_digest_enabled)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (enabled === null) return null

  const toggle = async () => {
    if (!supabase) return
    const next = !enabled
    setBusy(true)
    setError("")
    const { error: updateError } = await supabase.from("profiles").update({ weekly_digest_enabled: next }).eq("id", userId)
    setBusy(false)
    if (updateError) {
      setError(t("digest.saveError"))
      return
    }
    setEnabled(next)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-gray-900">{t("digest.settingTitle")}</p>
          <p className="mt-1 text-xs text-slate-600">{t("digest.settingHint")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={busy}
          onClick={() => void toggle()}
          className={`relative h-9 w-[3.25rem] shrink-0 rounded-full transition disabled:opacity-50 ${
            enabled ? "bg-emerald-600" : "bg-slate-400"
          }`}
        >
          <span
            className={`absolute top-1 left-1 h-7 w-7 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-[1.35rem]" : "translate-x-0"
            }`}
          />
          <span className="sr-only">{t("digest.settingTitle")}</span>
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
