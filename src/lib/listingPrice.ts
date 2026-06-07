import { getCurrentLocale, translate } from "../i18n/translate.ts"
import type { AppLocale } from "../i18n/types.ts"

export type PriceType = "fixed" | "hourly" | "monthly"

/** Short labels for forms, filters, and period suffixes (სრული / საათი / თვე). */
export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  fixed: "სრული",
  hourly: "საათი",
  monthly: "თვე",
}

/** @deprecated Use PRICE_TYPE_LABELS */
export const LISTING_PRICE_TYPE_LABELS = PRICE_TYPE_LABELS

export type ListingPriceType = PriceType

export function normalizeListingPriceType(value: string | null | undefined): PriceType {
  if (value === "hourly" || value === "monthly") return value
  return "fixed"
}

function priceTypeLabel(type: PriceType, locale: AppLocale): string {
  const key =
    type === "hourly"
      ? "common.pricePeriodHourly"
      : type === "monthly"
        ? "common.pricePeriodMonthly"
        : "common.pricePeriodFixed"
  return translate(locale, key)
}

function formatAmount(value: number, locale: AppLocale): string {
  return value.toLocaleString(locale === "en" ? "en-US" : "ka-GE")
}

/** Single listing/service price with period, e.g. ₾500/საათი */
export function formatListingPrice(
  price: number,
  priceType: string | null | undefined,
  options?: { negotiable?: boolean; locale?: AppLocale },
): string {
  const locale = options?.locale ?? getCurrentLocale()
  if (options?.negotiable || price === 0) return translate(locale, "common.negotiable")
  const type = normalizeListingPriceType(priceType)
  const period = priceTypeLabel(type, locale)
  return `₾${formatAmount(price, locale)}/${period}`
}

/** Job budget range or rate with period, e.g. ₾500 - ₾1500/სრული or ₾50/საათი */
export function formatJobBudget(
  budgetMin: number | null,
  budgetMax: number | null,
  budgetType: string | null | undefined,
  locale?: AppLocale,
): string {
  const loc = locale ?? getCurrentLocale()
  const type = normalizeListingPriceType(budgetType)
  const period = priceTypeLabel(type, loc)
  const min = budgetMin ?? budgetMax
  const max = budgetMax ?? budgetMin

  if (type === "hourly" || type === "monthly") {
    const value = min ?? 0
    return `₾${formatAmount(value, loc)}/${period}`
  }

  if (min !== null && max !== null && min !== max) {
    return `₾${formatAmount(min, loc)} - ₾${formatAmount(max, loc)}/${period}`
  }
  if (min !== null) {
    return `₾${formatAmount(min, loc)}/${period}`
  }
  if (max !== null) {
    return `₾${formatAmount(max, loc)}/${period}`
  }
  return translate(loc, "common.negotiable")
}

/** Input label when applying to a job (hourly/monthly rate fields). */
export function jobApplicationRateLabel(budgetType: string | null | undefined, locale?: AppLocale): string {
  const loc = locale ?? getCurrentLocale()
  const type = normalizeListingPriceType(budgetType)
  if (type === "hourly") return translate(loc, "jobs.hourlyRateLabel")
  if (type === "monthly") return translate(loc, "jobs.monthlyRateLabel")
  return translate(loc, "jobs.proposedPriceLabel")
}
