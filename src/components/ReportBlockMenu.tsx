import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import {
  REPORT_REASONS,
  blockUser,
  isUserBlocked,
  reportContent,
  unblockUser,
  type ReportReason,
  type ReportTargetType,
} from "../lib/moderation.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase.ts"
import { getAuthenticatedSession } from "../lib/supabaseAuth.ts"

type ReportBlockMenuProps = {
  /** What is being reported. */
  targetType: ReportTargetType
  targetId: string
  /** `profiles.id` of the owner; enables "Block" and hides the menu on your own content. */
  targetUserId?: string | null
  className?: string
  /** Called after block state changes (e.g. to disable a chat composer). */
  onBlockChange?: (blocked: boolean) => void
}

/** "⋯" menu with Report and Block/Unblock. Self-contained: resolves the viewer itself. */
export default function ReportBlockMenu({
  targetType,
  targetId,
  targetUserId,
  className,
  onBlockChange,
}: ReportBlockMenuProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [checked, setChecked] = useState(() => !isSupabaseConfigured || !supabase)
  const [open, setOpen] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [notice, setNotice] = useState("")
  const menuRef = useRef<HTMLDivElement>(null)
  const onBlockChangeRef = useRef(onBlockChange)
  useEffect(() => {
    onBlockChangeRef.current = onBlockChange
  })

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    let cancelled = false
    void (async () => {
      const { user } = await getAuthenticatedSession(supabase)
      if (cancelled) return
      setViewerId(user?.id ?? null)
      if (user && targetUserId && user.id !== targetUserId) {
        const isBlocked = await isUserBlocked(supabase, user.id, targetUserId)
        if (!cancelled) {
          setBlocked(isBlocked)
          onBlockChangeRef.current?.(isBlocked)
        }
      }
      if (!cancelled) setChecked(true)
    })()
    return () => {
      cancelled = true
    }
  }, [targetUserId])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointer)
    return () => document.removeEventListener("mousedown", onPointer)
  }, [open])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(""), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  if (!checked || !targetId) return null
  if (viewerId && targetUserId && viewerId === targetUserId) return null

  const requireLogin = () => {
    navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
  }

  const toggleBlock = async () => {
    setOpen(false)
    if (!supabase || !targetUserId) return
    if (!viewerId) return requireLogin()
    if (!blocked && !window.confirm(t("moderation.blockConfirm"))) return
    const { error } = blocked
      ? await unblockUser(supabase, viewerId, targetUserId)
      : await blockUser(supabase, viewerId, targetUserId)
    if (error) {
      setNotice(t("moderation.actionFailed"))
      return
    }
    const next = !blocked
    setBlocked(next)
    onBlockChange?.(next)
    setNotice(next ? t("moderation.blocked") : t("moderation.unblocked"))
  }

  return (
    <div ref={menuRef} className={`relative inline-flex ${className ?? ""}`}>
      <button
        type="button"
        aria-label={t("moderation.moreActions")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
          <circle cx="5" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="19" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              if (!viewerId) return requireLogin()
              setReportOpen(true)
            }}
            className="block w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50"
          >
            {t("moderation.report")}
          </button>
          {targetUserId ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => void toggleBlock()}
              className="block w-full px-4 py-2 text-left text-red-600 hover:bg-red-50"
            >
              {blocked ? t("moderation.unblockUser") : t("moderation.blockUser")}
            </button>
          ) : null}
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          className="absolute right-0 top-11 z-50 w-max max-w-[16rem] rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
        >
          {notice}
        </div>
      ) : null}

      {reportOpen && viewerId ? (
        <ReportDialog
          onClose={() => setReportOpen(false)}
          onSubmit={async (reason, details) => {
            if (!supabase) return false
            const { error } = await reportContent(supabase, {
              reporterId: viewerId,
              targetType,
              targetId,
              reason,
              details,
            })
            if (error) return false
            setReportOpen(false)
            setNotice(t("moderation.reportSent"))
            return true
          }}
        />
      ) : null}
    </div>
  )
}

function ReportDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (reason: ReportReason, details: string) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState<ReportReason | "">("")
  const [details, setDetails] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const submit = async () => {
    if (!reason || busy) return
    setBusy(true)
    setError("")
    const ok = await onSubmit(reason, details)
    setBusy(false)
    if (!ok) setError(t("moderation.actionFailed"))
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-dialog-title"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 id="report-dialog-title" className="text-lg font-bold text-[#1B2B4B]">
          {t("moderation.reportTitle")}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{t("moderation.reportHint")}</p>

        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">{t("moderation.reason")}</legend>
          {REPORT_REASONS.map((value) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="report-reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
              />
              {t(`moderation.reasons.${value}`)}
            </label>
          ))}
        </fieldset>

        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={1000}
          rows={3}
          placeholder={t("moderation.detailsPlaceholder")}
          className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={!reason || busy}
            onClick={() => void submit()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("moderation.sendReport")}
          </button>
        </div>
      </div>
    </div>
  )
}
