import type { AppLocale } from "../i18n/types.ts"

export type CategoryNameSource = {
  name_ka: string
  name_en?: string | null
}

/** Pick marketplace category/subcategory label for the active locale. */
export function pickCategoryName(source: CategoryNameSource, locale: AppLocale): string {
  const ka = String(source.name_ka ?? "").trim()
  const en = String(source.name_en ?? "").trim()
  if (locale === "en" && en) return en
  return ka || en
}

export type LocalizedNameEntry = { name_ka: string; name_en: string }

export function localizedNameFromMap(
  map: Map<string, LocalizedNameEntry>,
  id: string | null | undefined,
  locale: AppLocale,
): string | undefined {
  if (!id) return undefined
  const entry = map.get(id)
  if (!entry) return undefined
  return pickCategoryName(entry, locale)
}
