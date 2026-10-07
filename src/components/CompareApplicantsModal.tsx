import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { supabase } from "../lib/supabase"
import { avatarImageUrl, jobOrServiceImageDisplayUrl } from "../lib/storageImageUrl.ts"
import { initialsFromName } from "../lib/cvFromProfile.ts"
import StartConversationButton from "./StartConversationButton.tsx"

export type CompareApplicant = {
  application_id: string
  status: string
  is_shortlisted: boolean
  created_at: string
  cover_note: string | null
  proposed_rate: number | null
  freelancer_profile_id: string
  freelancer_user_id: string
  slug: string | null
  professional_title: string | null
  average_rating: number | null
  total_reviews_count: number | null
  completed_jobs_count: number | null
  is_accepting_new_work: boolean | null
  full_name: string | null
  avatar_url: string | null
  city: string | null
  is_verified: boolean | null
  portfolio_count: number
  portfolio_thumbs: string[] | null
  skill_match: number
  response_minutes: number | null
}

type CompareJob = {
  id: string
  title: string
  budget_min: number | null
  budget_max: number | null
  budget_type: string | null
  status: string
  skill_count: number
}

type ComparePayload = { job: CompareJob; applicants: CompareApplicant[] }

type Props = {
  jobId: string
  onClose: () => void
  /** Accept / reject reuse the dashboard flows (notifications, vacancy bookkeeping). */
  onAccept: (applicationId: string) => Promise<void>
  onReject: (applicationId: string) => Promise<void>
}

/** Legacy applications kept the rate only in the cover note. */
const LEGACY_RATE_RE = /შემოთავაზებული ტარიფი: ₾([0-9]+(?:\.[0-9]+)?)/

function applicantRate(a: CompareApplicant): number | null {
  if (a.proposed_rate != null) return Number(a.proposed_rate)
  const m = a.cover_note?.match(LEGACY_RATE_RE)
  return m ? Number(m[1]) : null
}

function coverNoteText(a: CompareApplicant): string {
  return (a.cover_note ?? "").replace(LEGACY_RATE_RE, "").trim()
}

async function fetchCompare(jobId: string): Promise<ComparePayload> {
  if (!supabase) throw new Error("Supabase is not configured")
  const { data, error } = await supabase.rpc("get_job_applicants_compare", { p_job_id: jobId })
  if (error) throw error
  const payload = data as unknown as ComparePayload
  return { job: payload.job, applicants: payload.applicants ?? [] }
}

function BestPill({ label }: { label: string }) {
  return (
    <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
      {label}
    </span>
  )
}

function money(value: number) {
  return `${Math.round(value).toLocaleString("en-US").replace(/,/g, " ")} ₾`
}

export default function CompareApplicantsModal({ jobId, onClose, onAccept, onReject }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const queryKey = ["compare-applicants", jobId] as const
  const { data, isLoading, isError, refetch } = useQuery({ queryKey, queryFn: () => fetchCompare(jobId) })
  const [shortlistedOnly, setShortlistedOnly] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  const applicants = useMemo(() => {
    const list = (data?.applicants ?? []).filter((a) => a.status !== "rejected" && a.status !== "cancelled")
    return shortlistedOnly ? list.filter((a) => a.is_shortlisted) : list
  }, [data, shortlistedOnly])

  // "Best" marker per row, only when there is something to compare.
  const best = useMemo(() => {
    const pick = (values: Array<number | null>, mode: "min" | "max") => {
      const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
      if (nums.length < 2) return null
      return mode === "min" ? Math.min(...nums) : Math.max(...nums)
    }
    return {
      rate: pick(applicants.map(applicantRate), "min"),
      rating: pick(applicants.map((a) => (a.total_reviews_count ? Number(a.average_rating ?? 0) : null)), "max"),
      completed: pick(applicants.map((a) => Number(a.completed_jobs_count ?? 0) || null), "max"),
      response: pick(applicants.map((a) => a.response_minutes), "min"),
      skills: pick(applicants.map((a) => a.skill_match || null), "max"),
      portfolio: pick(applicants.map((a) => a.portfolio_count || null), "max"),
    }
  }, [applicants])

  const shortlistedCount = (data?.applicants ?? []).filter((a) => a.is_shortlisted).length

  const setShortlisted = async (a: CompareApplicant, next: boolean) => {
    if (!supabase) return
    setActionError("")
    setBusyId(a.application_id)
    // Optimistic: the flag only matters to this hirer.
    queryClient.setQueryData<ComparePayload>(queryKey, (prev) =>
      prev
        ? {
            ...prev,
            applicants: prev.applicants.map((x) =>
              x.application_id === a.application_id ? { ...x, is_shortlisted: next } : x,
            ),
          }
        : prev,
    )
    const { error } = await supabase.from("job_applications").update({ is_shortlisted: next }).eq("id", a.application_id)
    setBusyId(null)
    if (error) {
      setActionError(t("compare.actionError"))
      void refetch()
    }
  }

  const runAction = async (a: CompareApplicant, action: "accept" | "reject") => {
    setActionError("")
    setBusyId(a.application_id)
    try {
      if (action === "accept") await onAccept(a.application_id)
      else await onReject(a.application_id)
      await refetch()
    } catch {
      setActionError(t("compare.actionError"))
    } finally {
      setBusyId(null)
    }
  }

  const formatResponse = (minutes: number | null) => {
    if (minutes == null) return t("compare.responseUnknown")
    if (minutes < 60) return t("compare.minutes", { n: Math.max(1, minutes) })
    if (minutes < 60 * 48) return t("compare.hours", { n: Math.round(minutes / 60) })
    return t("compare.days", { n: Math.round(minutes / 1440) })
  }

  const job = data?.job
  const budgetText = job
    ? job.budget_min != null || job.budget_max != null
      ? [job.budget_min, job.budget_max]
          .filter((v, i, arr): v is number => v != null && arr.indexOf(v) === i)
          .map(money)
          .join(" – ")
      : t("compare.budgetNegotiable")
    : ""

  const rowLabel = "sticky left-0 z-10 w-32 min-w-32 bg-slate-50 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:w-40 sm:min-w-40"
  const cell = "min-w-[220px] max-w-[260px] border-l border-slate-100 px-3 py-3 align-top text-sm text-slate-700"

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-applicants-title"
      className="fixed inset-0 z-[95] flex items-stretch justify-center bg-black/45 sm:p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex w-full max-w-6xl flex-col overflow-hidden bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="compare-applicants-title" className="text-lg font-bold text-[#1B2B4B] sm:text-xl">
              {t("compare.title")}
            </h2>
            {job ? (
              <p className="mt-0.5 truncate text-sm text-slate-600">
                {job.title} · {t("compare.yourBudget", { budget: budgetText })}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            {t("compare.close")}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setShortlistedOnly(false)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              !shortlistedOnly ? "bg-[#0088FF] text-white" : "border border-slate-300 bg-white text-slate-700 hover:border-[#0088FF]"
            }`}
          >
            {t("compare.all")}
          </button>
          <button
            type="button"
            onClick={() => setShortlistedOnly(true)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              shortlistedOnly ? "bg-[#0088FF] text-white" : "border border-slate-300 bg-white text-slate-700 hover:border-[#0088FF]"
            }`}
          >
            ★ {t("compare.shortlistedOnly", { count: shortlistedCount })}
          </button>
          <p className="ml-auto hidden text-xs text-slate-500 sm:block">{t("compare.scrollHint")}</p>
        </div>

        {actionError ? (
          <p className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-6">{actionError}</p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#0088FF]" />
            </div>
          ) : isError ? (
            <p className="p-6 text-sm text-red-700">{t("compare.loadError")}</p>
          ) : applicants.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">{shortlistedOnly ? t("compare.emptyShortlist") : t("compare.empty")}</p>
          ) : (
            <table className="min-w-full border-collapse">
              <tbody>
                <tr className="border-b border-slate-200">
                  <th className={rowLabel} scope="row" />
                  {applicants.map((a) => {
                    const avatar = a.avatar_url ? avatarImageUrl(supabase, a.avatar_url) ?? a.avatar_url : null
                    const name = a.full_name?.trim() || t("compare.freelancer")
                    return (
                      <td key={a.application_id} className={`${cell} ${a.is_shortlisted ? "bg-amber-50/60" : ""}`}>
                        <div className="flex items-center gap-3">
                          {avatar ? (
                            <img src={avatar} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" loading="lazy" />
                          ) : (
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E8F4FF] text-sm font-bold text-[#0088FF]">
                              {initialsFromName(name)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[#1B2B4B]">
                              {name}
                              {a.is_verified ? <span className="ml-1 text-[#0088FF]" title={t("compare.verified")}>✓</span> : null}
                            </p>
                            <p className="truncate text-xs text-slate-500">{a.professional_title || "-"}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busyId === a.application_id}
                          onClick={() => void setShortlisted(a, !a.is_shortlisted)}
                          className={`mt-3 w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                            a.is_shortlisted
                              ? "border border-[#D4A843] bg-[#D4A843] text-[#1B2B4B]"
                              : "border border-slate-300 bg-white text-slate-700 hover:border-[#D4A843]"
                          }`}
                        >
                          {a.is_shortlisted ? `★ ${t("compare.shortlisted")}` : `☆ ${t("compare.shortlist")}`}
                        </button>
                      </td>
                    )
                  })}
                </tr>

                <tr className="border-b border-slate-100">
                  <th className={rowLabel} scope="row">{t("compare.rate")}</th>
                  {applicants.map((a) => {
                    const rate = applicantRate(a)
                    return (
                      <td key={a.application_id} className={cell}>
                        {rate != null ? (
                          <span className="font-semibold text-[#1B2B4B]">
                            {money(rate)}
                            {best.rate === rate ? <BestPill label={t("compare.best")} /> : null}
                          </span>
                        ) : (
                          <span className="text-slate-400">{t("compare.noRate")}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>

                <tr className="border-b border-slate-100">
                  <th className={rowLabel} scope="row">{t("compare.rating")}</th>
                  {applicants.map((a) => {
                    const reviews = Number(a.total_reviews_count ?? 0)
                    const rating = Number(a.average_rating ?? 0)
                    return (
                      <td key={a.application_id} className={cell}>
                        {reviews > 0 ? (
                          <span>
                            <span className="font-semibold text-[#1B2B4B]">★ {rating.toFixed(1)}</span>
                            <span className="text-slate-500"> · {t("compare.reviews", { count: reviews })}</span>
                            {best.rating === rating ? <BestPill label={t("compare.best")} /> : null}
                          </span>
                        ) : (
                          <span className="text-slate-400">{t("compare.noReviews")}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>

                <tr className="border-b border-slate-100">
                  <th className={rowLabel} scope="row">{t("compare.completed")}</th>
                  {applicants.map((a) => {
                    const n = Number(a.completed_jobs_count ?? 0)
                    return (
                      <td key={a.application_id} className={cell}>
                        {n}
                        {best.completed === n ? <BestPill label={t("compare.best")} /> : null}
                      </td>
                    )
                  })}
                </tr>

                <tr className="border-b border-slate-100">
                  <th className={rowLabel} scope="row">{t("compare.responseTime")}</th>
                  {applicants.map((a) => (
                    <td key={a.application_id} className={cell}>
                      <span className={a.response_minutes == null ? "text-slate-400" : ""}>{formatResponse(a.response_minutes)}</span>
                      {a.response_minutes != null && best.response === a.response_minutes ? <BestPill label={t("compare.best")} /> : null}
                    </td>
                  ))}
                </tr>

                <tr className="border-b border-slate-100">
                  <th className={rowLabel} scope="row">{t("compare.skillMatch")}</th>
                  {applicants.map((a) => (
                    <td key={a.application_id} className={cell}>
                      {job && job.skill_count > 0 ? t("compare.skillsOf", { n: a.skill_match, total: job.skill_count }) : "-"}
                      {a.skill_match > 0 && best.skills === a.skill_match ? <BestPill label={t("compare.best")} /> : null}
                    </td>
                  ))}
                </tr>

                <tr className="border-b border-slate-100">
                  <th className={rowLabel} scope="row">{t("compare.portfolio")}</th>
                  {applicants.map((a) => {
                    const thumbs = (a.portfolio_thumbs ?? []).slice(0, 3)
                    return (
                      <td key={a.application_id} className={cell}>
                        {thumbs.length > 0 ? (
                          <div className="flex gap-1.5">
                            {thumbs.map((src) => (
                              <img
                                key={src}
                                src={jobOrServiceImageDisplayUrl(supabase, src, "thumbnail") ?? src}
                                alt=""
                                loading="lazy"
                                className="h-14 w-14 rounded-md border border-slate-200 object-cover"
                              />
                            ))}
                          </div>
                        ) : null}
                        <p className={`text-xs ${thumbs.length ? "mt-1.5 text-slate-500" : "text-slate-400"}`}>
                          {t("compare.portfolioCount", { count: a.portfolio_count })}
                          {a.portfolio_count > 0 && best.portfolio === a.portfolio_count ? <BestPill label={t("compare.best")} /> : null}
                        </p>
                      </td>
                    )
                  })}
                </tr>

                <tr className="border-b border-slate-100">
                  <th className={rowLabel} scope="row">{t("compare.city")}</th>
                  {applicants.map((a) => (
                    <td key={a.application_id} className={cell}>{a.city || "-"}</td>
                  ))}
                </tr>

                <tr className="border-b border-slate-100">
                  <th className={rowLabel} scope="row">{t("compare.coverNote")}</th>
                  {applicants.map((a) => {
                    const note = coverNoteText(a)
                    const open = Boolean(expandedNotes[a.application_id])
                    return (
                      <td key={a.application_id} className={cell}>
                        {note ? (
                          <>
                            <p className={`whitespace-pre-line break-words ${open ? "" : "line-clamp-4"}`}>{note}</p>
                            {note.length > 180 ? (
                              <button
                                type="button"
                                onClick={() => setExpandedNotes((prev) => ({ ...prev, [a.application_id]: !open }))}
                                className="mt-1 text-xs font-semibold text-[#0088FF] hover:underline"
                              >
                                {open ? t("compare.less") : t("compare.more")}
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    )
                  })}
                </tr>

                <tr>
                  <th className={rowLabel} scope="row" />
                  {applicants.map((a) => (
                    <td key={a.application_id} className={cell}>
                      <div className="flex flex-col gap-2">
                        {a.status === "pending" ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={busyId === a.application_id}
                              onClick={() => void runAction(a, "accept")}
                              className="flex-1 rounded-lg bg-[#0088FF] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#006ACC] disabled:opacity-50"
                            >
                              {t("compare.accept")}
                            </button>
                            <button
                              type="button"
                              disabled={busyId === a.application_id}
                              onClick={() => void runAction(a, "reject")}
                              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                            >
                              {t("compare.reject")}
                            </button>
                          </div>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-center text-xs font-semibold text-emerald-700">
                            {t("compare.accepted")}
                          </span>
                        )}
                        <StartConversationButton
                          otherUserId={a.freelancer_user_id}
                          jobApplicationId={a.application_id}
                          label={t("compare.message")}
                          variant="outline"
                          className="h-9 w-full text-xs"
                        />
                        {a.slug ? (
                          <Link
                            to={`/freelancer/${encodeURIComponent(a.slug)}`}
                            target="_blank"
                            rel="noopener"
                            className="text-center text-xs font-semibold text-[#D4A843] hover:underline"
                          >
                            {t("compare.viewProfile")} →
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
