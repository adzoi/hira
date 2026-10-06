import { useTranslation } from "../i18n/LocaleContext.tsx"
import { COINS_PER_REFERRAL, referralLink, VIP_COIN_COST, VIP_COIN_DAYS } from "../lib/referral.ts"
import { useReferralSummary } from "../lib/queries/fetchReferralSummary.ts"
import ShareButtons from "./ShareButtons.tsx"

/** Dashboard card: referral link, coin balance and how coins turn into VIP placement. */
export default function ReferralCard() {
  const { t } = useTranslation()
  const { data } = useReferralSummary()

  // Hidden until the migration is applied and the user has a code.
  if (!data?.referral_code) return null
  const link = referralLink(data.referral_code)

  return (
    <div className="rounded-xl border border-[#D4A843]/50 bg-amber-50/60 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-[#1B2B4B]">{t("referral.heading")}</h3>
          <p className="mt-1 text-sm text-slate-700">
            {t("referral.howItWorks", { reward: COINS_PER_REFERRAL, cost: VIP_COIN_COST, days: VIP_COIN_DAYS })}
          </p>
        </div>
        <div className="shrink-0 rounded-xl bg-white px-4 py-3 text-center shadow-sm">
          <p className="text-2xl font-bold text-[#1B2B4B]">🪙 {data.coins}</p>
          <p className="text-xs text-slate-500">{t("referral.coins")}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm break-all text-slate-700">
        {link}
      </div>
      <ShareButtons url={link} text={t("referral.shareText")} className="mt-3" />

      <p className="mt-4 text-sm text-slate-600">
        {t("referral.counts", { rewarded: data.rewarded, pending: data.pending })}
      </p>
      {data.coins >= VIP_COIN_COST ? (
        <p className="mt-1 text-sm font-semibold text-[#1B2B4B]">{t("referral.canSpend", { cost: VIP_COIN_COST })}</p>
      ) : null}
    </div>
  )
}
