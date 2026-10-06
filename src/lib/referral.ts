import { consentGatedGetItem, consentGatedRemoveItem, consentGatedSetItem } from "./consentGatedStorage.ts"

const STORAGE_KEY = "hira-referral-code"
const CODE_RE = /^[a-z0-9]{4,16}$/

function normalize(code: string | null | undefined): string | null {
  const value = code?.trim().toLowerCase() ?? ""
  return CODE_RE.test(value) ? value : null
}

/** Remembers ?ref=CODE from any landing URL so it survives until the visitor signs up. */
export function captureReferralFromUrl(search: string): void {
  const code = normalize(new URLSearchParams(search).get("ref"))
  if (!code) return
  // Respects cookie consent: without it the code is kept in memory for this visit only.
  consentGatedSetItem(STORAGE_KEY, code)
}

export function storedReferralCode(): string | null {
  return normalize(consentGatedGetItem(STORAGE_KEY))
}

export function clearStoredReferralCode(): void {
  consentGatedRemoveItem(STORAGE_KEY)
}

export function referralLink(code: string): string {
  return `https://hira.ge/register?ref=${encodeURIComponent(code)}`
}

/** Coins earned per qualified referral and the price of 7 days of VIP (mirrors the SQL functions). */
export const COINS_PER_REFERRAL = 5
export const VIP_COIN_COST = 10
export const VIP_COIN_DAYS = 7
