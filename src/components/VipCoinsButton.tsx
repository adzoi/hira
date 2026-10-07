import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { useReferralSummary } from "../lib/queries/fetchReferralSummary.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { VIP_COIN_COST, VIP_COIN_DAYS } from "../lib/referral.ts"
import { supabase } from "../lib/supabase"

type VipCoinsButtonProps = {
  kind: "job" | "service"
  id: string
  /** Current VIP expiry of the post, if any. */
  vipExpiresAt?: string | null
  /** Query to refresh after the post becomes VIP. */
  invalidateKey?: readonly unknown[]
  /** Smaller layout for dashboard lists. */
  compact?: boolean
}

function msLeft(expiresAt: string | null): number {
  if (!expiresAt) return 0
  const t = new Date(expiresAt).getTime()
  return Number.isFinite(t) ? Math.max(0, t - Date.now()) : 0
}

/** Ticks once a minute while VIP is active. */
function useRemainingMs(expiresAt: string | null): number {
  const [remaining, setRemaining] = useState(() => msLeft(expiresAt))
  useEffect(() => {
    const update = () => setRemaining(msLeft(expiresAt))
    const first = window.setTimeout(update, 0)
    const timerId = window.setInterval(update, 60_000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timerId)
    }
  }, [expiresAt])
  return remaining
}

/**
 * Owner-only: shows how long the post stays VIP and lets the owner spend coins
 * to make it VIP for a week (or extend an active VIP).
 */
export default function VipCoinsButton({ kind, id, vipExpiresAt = null, invalidateKey, compact = false }: VipCoinsButtonProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [purchasedExpiry, setPurchasedExpiry] = useState<string | null>(null)
  const { data: summary, userId } = useReferralSummary()

  const expiresAt = purchasedExpiry ?? vipExpiresAt
  const remaining = useRemainingMs(expiresAt)
  const active = remaining > 0

  if (!summary) return null
  const coins = summary.coins

  const totalMinutes = Math.floor(remaining / 60_000)
  const countdown = t("referral.vipCountdown", {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  })

  const spend = async () => {
    if (!supabase) return
    const confirmKey = active ? "referral.confirmExtend" : "referral.confirmSpend"
    if (!window.confirm(t(confirmKey, { cost: VIP_COIN_COST, days: VIP_COIN_DAYS }))) return
    setBusy(true)
    setMessage(null)
    const { data, error } = await supabase.rpc("spend_coins_for_vip", { p_kind: kind, p_id: id })
    setBusy(false)
    if (error) {
      const text = error.message.includes("insufficient_coins") ? t("referral.notEnough", { cost: VIP_COIN_COST }) : t("referral.spendError")
      setMessage({ ok: false, text })
      return
    }
    const newExpiry = (data as { vip_expires_at?: string } | null)?.vip_expires_at
    if (newExpiry) setPurchasedExpiry(newExpiry)
    setMessage({ ok: true, text: t("referral.spendDone", { days: VIP_COIN_DAYS }) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.referralSummary(userId) })
    if (invalidateKey) void queryClient.invalidateQueries({ queryKey: invalidateKey })
  }

  const button = (
    <button
      type="button"
      disabled={busy || coins < VIP_COIN_COST}
      onClick={() => void spend()}
      className={`inline-flex shrink-0 items-center rounded-full bg-[#D4A843] font-bold text-[#1B2B4B] transition hover:bg-[#c99a2e] disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm"}`}
    >
      {busy
        ? t("common.inProgress")
        : active
          ? t("referral.vipExtendButton", { cost: VIP_COIN_COST, days: VIP_COIN_DAYS })
          : t("referral.vipButton", { cost: VIP_COIN_COST })}
    </button>
  )

  const status = active ? (
    <p className="font-semibold text-[#1B2B4B]">
      <span className="mr-1.5 rounded-full bg-[#D4A843] px-2 py-0.5 text-[10px] font-bold">VIP</span>
      {countdown}
    </p>
  ) : (
    <p className="font-semibold">{t("referral.vipTitle", { days: VIP_COIN_DAYS })}</p>
  )

  if (compact) {
    return (
      <div className="mt-3 rounded-lg border border-[#D4A843]/50 bg-amber-50/60 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#1B2B4B]">
          <div className="min-w-0">
            {status}
            <p className="text-slate-600">{t("referral.balance", { coins })}</p>
          </div>
          {button}
        </div>
        {message ? (
          <p className={`mt-1 text-xs font-semibold ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[#D4A843]/50 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-sm text-[#1B2B4B]">
          {status}
          <p className="text-xs text-slate-600">
            {active ? `${t("referral.vipOnlyYou")} · ` : ""}
            {t("referral.balance", { coins })}
          </p>
        </div>
        {button}
      </div>
      {coins < VIP_COIN_COST && !message ? (
        <p className="mt-2 text-xs text-slate-600">{t("referral.notEnoughHint", { cost: VIP_COIN_COST })}</p>
      ) : null}
      {message ? (
        <p className={`mt-2 text-xs font-semibold ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>
      ) : null}
    </div>
  )
}
