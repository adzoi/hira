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

function formatAmount(value: number): string {
  return value.toLocaleString("ka-GE")
}

/** Single listing/service price with period, e.g. ₾500/საათი */
export function formatListingPrice(
  price: number,
  priceType: string | null | undefined,
  options?: { negotiable?: boolean },
): string {
  if (options?.negotiable || price === 0) return "შეთანხმებით"
  const type = normalizeListingPriceType(priceType)
  const period = PRICE_TYPE_LABELS[type]
  return `₾${formatAmount(price)}/${period}`
}

/** Job budget range or rate with period, e.g. ₾500 - ₾1500/სრული or ₾50/საათი */
export function formatJobBudget(
  budgetMin: number | null,
  budgetMax: number | null,
  budgetType: string | null | undefined,
): string {
  const type = normalizeListingPriceType(budgetType)
  const period = PRICE_TYPE_LABELS[type]
  const min = budgetMin ?? budgetMax
  const max = budgetMax ?? budgetMin

  if (type === "hourly" || type === "monthly") {
    const value = min ?? 0
    return `₾${formatAmount(value)}/${period}`
  }

  if (min !== null && max !== null && min !== max) {
    return `₾${formatAmount(min)} - ₾${formatAmount(max)}/${period}`
  }
  if (min !== null) {
    return `₾${formatAmount(min)}/${period}`
  }
  if (max !== null) {
    return `₾${formatAmount(max)}/${period}`
  }
  return "შეთანხმებით"
}

/** Input label when applying to a job (hourly/monthly rate fields). */
export function jobApplicationRateLabel(budgetType: string | null | undefined): string {
  const type = normalizeListingPriceType(budgetType)
  if (type === "hourly") return "საათის განაკვეთი (₾)"
  if (type === "monthly") return "თვის გასამრჯელო (₾)"
  return "შემოთავაზებული ფასი (₾)"
}
