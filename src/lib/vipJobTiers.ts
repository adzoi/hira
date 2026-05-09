/**
 * Customer-facing prices are in GEL (₾). PayPal still charges **USD** in this setup (sandbox GEL not used).
 * USD is derived from GEL with `GEL_PER_USD_FOR_PAYPAL` — keep in sync with `supabase/functions/activate-vip`.
 */
export const GEL_PER_USD_FOR_PAYPAL = 2.75

export const VIP_JOB_TIERS = {
  bronze: { priceGel: 10, days: 7, currency: "USD" as const },
  silver: { priceGel: 20, days: 14, currency: "USD" as const },
  gold: { priceGel: 30, days: 30, currency: "USD" as const },
} as const

export type VipJobTier = keyof typeof VIP_JOB_TIERS

/** PayPal / server validation amount in USD (2 decimal places). */
export function vipTierPayPalUsd(tier: VipJobTier): number {
  const gel = VIP_JOB_TIERS[tier].priceGel
  return Math.round((gel / GEL_PER_USD_FOR_PAYPAL) * 100) / 100
}

export function jobVipIsActive(isVip: boolean, vipExpiresAt: string | null | undefined): boolean {
  if (!isVip) return false
  if (vipExpiresAt == null || String(vipExpiresAt).trim() === "") return true
  const t = new Date(vipExpiresAt).getTime()
  if (!Number.isFinite(t)) return false
  return t > Date.now()
}
