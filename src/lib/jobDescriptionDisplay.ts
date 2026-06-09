import type { AppLocale } from "../i18n/types.ts"
import { pickListingDescription } from "./listingLocale.ts"
import { sanitizeHtmlForDisplay } from "./sanitizeHtml.ts"

function isSupabaseErrorPayload(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.startsWith("{")) return false
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    return typeof parsed.code === "string" && typeof parsed.message === "string"
  } catch {
    return false
  }
}

export function stripSupabaseErrorJson(text: string): string {
  return text
    .replace(/\{\s*"code"\s*:\s*"[^"]*"[^}]*"message"\s*:\s*"[^"]*"[^}]*\}/g, "")
    .replace(/\{\s*"message"\s*:\s*"[^"]*"[^}]*"code"\s*:\s*"[^"]*"[^}]*\}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function cleanDescriptionField(raw: string | null | undefined): string {
  const text = sanitizeHtmlForDisplay(String(raw ?? "").trim())
  if (!text) return ""
  if (isSupabaseErrorPayload(text)) return ""
  return stripSupabaseErrorJson(text)
}

export function displayJobDescription(
  source: { description?: string | null; descriptionEn?: string | null },
  locale: AppLocale,
): string {
  const ka = cleanDescriptionField(source.description)
  const en = cleanDescriptionField(source.descriptionEn)
  if (locale === "en") return en || ka
  return ka || en
}

/** Same as display but without stripping Supabase error blobs (jobs list preview). */
export function displayJobDescriptionRaw(
  source: { description?: string | null; descriptionEn?: string | null },
  locale: AppLocale,
): string {
  return pickListingDescription(source, locale)
}
