import { useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "../../i18n/LocaleContext.tsx"
import { supabase } from "../../lib/supabase"
import type { JobRow } from "./dashboardShared.ts"
import { DAY_MS, STALE_JOB_DAYS } from "./staleJobs.ts"

type Props = {
  job: JobRow
  onClosed: (jobId: string) => void
  onKeptOpen: (jobId: string) => void
}

/** Nudge on a job nobody applied to: raise the budget, invite people, close it, or keep it open. */
export default function StaleJobBanner({ job, onClosed, onKeptOpen }: Props) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [now] = useState(() => Date.now())
  const days = Math.max(STALE_JOB_DAYS, Math.floor((now - Date.parse(job.stale_clock_at ?? job.created_at)) / DAY_MS))

  const closeJob = async () => {
    if (!supabase || !window.confirm(t("staleJob.closeConfirm"))) return
    setBusy(true)
    setError("")
    const { error: closeError } = await supabase.from("jobs").update({ status: "closed" }).eq("id", job.id)
    setBusy(false)
    if (closeError) {
      setError(t("staleJob.error"))
      return
    }
    onClosed(job.id)
  }

  const keepOpen = async () => {
    if (!supabase) return
    setBusy(true)
    setError("")
    const { error: keepError } = await supabase.rpc("keep_job_open", { p_job_id: job.id })
    setBusy(false)
    if (keepError) {
      setError(t("staleJob.error"))
      return
    }
    onKeptOpen(job.id)
  }

  const btn = "rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-[#1B2B4B]">{t("staleJob.title", { days })}</p>
      <p className="mt-0.5 text-xs text-slate-600">{t("staleJob.hint")}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Link to={`/post-job/${job.id}`} className={`${btn} bg-[#0088FF] text-white hover:bg-[#006ACC]`}>
          {t("staleJob.raiseBudget")}
        </Link>
        <Link to="/freelancers" className={`${btn} border border-[#0088FF] bg-white text-[#0088FF] hover:bg-[#E8F4FF]`}>
          {t("staleJob.invite")}
        </Link>
        <button type="button" disabled={busy} onClick={() => void keepOpen()} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
          {t("staleJob.keepOpen")}
        </button>
        <button type="button" disabled={busy} onClick={() => void closeJob()} className={`${btn} border border-red-200 bg-white text-red-700 hover:bg-red-50`}>
          {t("staleJob.close")}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  )
}
