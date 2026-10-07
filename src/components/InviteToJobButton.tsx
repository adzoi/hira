import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { supabase } from "../lib/supabase"
import { useToast } from "./ui/ToastProvider.tsx"

type InvitableJob = {
  id: string
  title: string
  /** Already invited or already applied: shown but not selectable. */
  blockedReason: "invited" | "applied" | null
}

type Props = {
  hirerProfileId: string
  freelancerProfileId: string
  freelancerName: string
  className?: string
}

const RESULT_KEYS: Record<string, string> = {
  invited: "invite.sent",
  already_invited: "invite.alreadyInvited",
  already_applied: "invite.alreadyApplied",
  job_closed: "invite.jobClosed",
  rate_limited: "invite.rateLimited",
}

async function loadInvitableJobs(hirerProfileId: string, freelancerProfileId: string): Promise<InvitableJob[]> {
  if (!supabase) return []
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("hirer_profile_id", hirerProfileId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(30)
  if (error) throw error
  const ids = (jobs ?? []).map((j) => j.id)
  if (ids.length === 0) return []

  const [{ data: invites }, { data: apps }] = await Promise.all([
    supabase.from("job_invitations").select("job_id").eq("freelancer_profile_id", freelancerProfileId).in("job_id", ids),
    supabase.from("job_applications").select("job_id").eq("freelancer_profile_id", freelancerProfileId).in("job_id", ids),
  ])
  const invited = new Set((invites ?? []).map((r) => r.job_id))
  const applied = new Set((apps ?? []).map((r) => r.job_id))
  return (jobs ?? []).map((j) => ({
    id: j.id,
    title: j.title,
    blockedReason: applied.has(j.id) ? "applied" : invited.has(j.id) ? "invited" : null,
  }))
}

/** Hirer-only: invite this freelancer to apply to one of the hirer's open jobs. */
export default function InviteToJobButton({ hirerProfileId, freelancerProfileId, freelancerName, className = "" }: Props) {
  const { t } = useTranslation()
  const { pushToast } = useToast()
  const [open, setOpen] = useState(false)
  const [jobs, setJobs] = useState<InvitableJob[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [jobId, setJobId] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    let cancelled = false
    loadInvitableJobs(hirerProfileId, freelancerProfileId)
      .then((list) => {
        if (cancelled) return
        setJobs(list)
        setJobId(list.find((j) => !j.blockedReason)?.id ?? "")
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => {
      cancelled = true
      document.removeEventListener("keydown", onKey)
    }
  }, [open, hirerProfileId, freelancerProfileId])

  const send = async () => {
    if (!supabase || !jobId) return
    setSending(true)
    setError("")
    const { data, error: rpcError } = await supabase.rpc("invite_freelancer_to_job", {
      p_job_id: jobId,
      p_freelancer_profile_id: freelancerProfileId,
      p_message: message.trim() || null,
    })
    setSending(false)
    if (rpcError) {
      setError(t("invite.error"))
      return
    }
    const result = String(data ?? "")
    if (result === "invited") {
      pushToast({ type: "success", message: t("invite.sent") })
      setOpen(false)
      setMessage("")
      return
    }
    setError(t(RESULT_KEYS[result] ?? "invite.error"))
    if (result === "already_invited" || result === "already_applied") {
      setJobs((prev) =>
        prev?.map((j) => (j.id === jobId ? { ...j, blockedReason: result === "already_applied" ? "applied" : "invited" } : j)) ?? prev,
      )
    }
  }

  const selectable = (jobs ?? []).filter((j) => !j.blockedReason)

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setJobs(null)
          setLoadError(false)
          setError("")
          setOpen(true)
        }}
        className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-[#D4A843] bg-amber-50 font-semibold text-[#1B2B4B] transition hover:bg-[#D4A843]/30 ${className}`}
      >
        {t("invite.button")}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-to-job-title"
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 p-4"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 id="invite-to-job-title" className="text-lg font-bold text-[#1B2B4B]">
              {t("invite.title", { name: freelancerName })}
            </h3>
            <p className="mt-1 text-sm text-slate-600">{t("invite.hint")}</p>

            {loadError ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t("invite.loadError")}</p>
            ) : jobs === null ? (
              <div className="mt-4 space-y-2">
                <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-center">
                <p className="text-sm text-slate-600">{t("invite.noJobs")}</p>
                <Link to="/post-job" className="mt-2 inline-block text-sm font-semibold text-[#0088FF] hover:underline">
                  {t("invite.postJob")}
                </Link>
              </div>
            ) : (
              <>
                <fieldset className="mt-4">
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("invite.pickJob")}</legend>
                  <div className="space-y-2">
                    {jobs.map((job) => (
                      <label
                        key={job.id}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                          job.blockedReason
                            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                            : jobId === job.id
                              ? "cursor-pointer border-[#0088FF] bg-[#E8F4FF] text-[#1B2B4B]"
                              : "cursor-pointer border-slate-200 text-[#1B2B4B] hover:border-[#0088FF]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="invite-job"
                          value={job.id}
                          checked={jobId === job.id}
                          disabled={Boolean(job.blockedReason)}
                          onChange={() => setJobId(job.id)}
                        />
                        <span className="min-w-0 flex-1 truncate">{job.title}</span>
                        {job.blockedReason ? (
                          <span className="shrink-0 text-xs font-semibold">
                            {job.blockedReason === "applied" ? t("invite.appliedBadge") : t("invite.invitedBadge")}
                          </span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="mt-4 block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t("invite.messageLabel")}</span>
                  <textarea
                    value={message}
                    maxLength={500}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    placeholder={t("invite.messagePlaceholder")}
                    className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#0088FF] focus:ring-2"
                  />
                  <span className="mt-1 block text-right text-xs text-slate-400">{message.length}/500</span>
                </label>
              </>
            )}

            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              {jobs && jobs.length > 0 ? (
                <button
                  type="button"
                  disabled={sending || !jobId || selectable.length === 0}
                  onClick={() => void send()}
                  className="flex-1 rounded-lg bg-[#0088FF] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#006ACC] disabled:opacity-50"
                >
                  {sending ? t("invite.sending") : t("invite.send")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t("invite.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
