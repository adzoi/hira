import type { AppLocale } from "../i18n/types.ts"

export type ListingTextSource = {
  title?: string | null
  titleEn?: string | null
  description?: string | null
  descriptionEn?: string | null
}

export function pickListingTitle(source: ListingTextSource, locale: AppLocale, fallback = ""): string {
  const ka = String(source.title ?? "").trim()
  const en = String(source.titleEn ?? "").trim()
  if (locale === "en" && en) return en
  return ka || en || fallback
}

export function pickListingDescription(source: ListingTextSource, locale: AppLocale, fallback = ""): string {
  const ka = String(source.description ?? "").trim()
  const en = String(source.descriptionEn ?? "").trim()
  if (locale === "en" && en) return en
  return ka || en || fallback
}
