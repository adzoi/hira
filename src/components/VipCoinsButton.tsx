import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { useReferralSummary } from "../lib/queries/fetchReferralSummary.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { VIP_COIN_COST, VIP_COIN_DAYS } from "../lib/referral.ts"
import { supabase } from "../lib/supabase"

type VipCoinsButtonProps = {
  kind: "job" | "service"
  id: string
  /** Query to refresh after the post becomes VIP. */
  invalidateKey: readonly unknown[]
}

/** Owner-only: spend coins to make a job or listing VIP for a week (extends an active VIP). */
export default function VipCoinsButton({ kind, id, invalidateKey }: VipCoinsButtonProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const { data: summary, userId } = useReferralSummary()

  if (!summary) return null
  const coins = summary.coins

  const spend = async () => {
    if (!supabase) return
    if (!window.confirm(t("referral.confirmSpend", { cost: VIP_COIN_COST, days: VIP_COIN_DAYS }))) return
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.rpc("spend_coins_for_vip", { p_kind: kind, p_id: id })
    setBusy(false)
    if (error) {
      const text = error.message.includes("insufficient_coins") ? t("referral.notEnough", { cost: VIP_COIN_COST }) : t("referral.spendError")
      setMessage({ ok: false, text })
      return
    }
    setMessage({ ok: true, text: t("referral.spendDone", { days: VIP_COIN_DAYS }) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.referralSummary(userId) })
    void queryClient.invalidateQueries({ queryKey: invalidateKey })
  }

  return (
    <div className="rounded-xl border border-[#D4A843]/50 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-sm text-[#1B2B4B]">
          <p className="font-semibold">{t("referral.vipTitle", { days: VIP_COIN_DAYS })}</p>
          <p className="text-xs text-slate-600">{t("referral.balance", { coins })}</p>
        </div>
        <button
          type="button"
          disabled={busy || coins < VIP_COIN_COST}
          onClick={() => void spend()}
          className="inline-flex h-10 shrink-0 items-center rounded-full bg-[#D4A843] px-4 text-sm font-bold text-[#1B2B4B] transition hover:bg-[#c99a2e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? t("common.inProgress") : t("referral.vipButton", { cost: VIP_COIN_COST })}
        </button>
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
