/** Shared limits and sanitizers for user-supplied text and payloads. */

import { getCurrentLocale, translate } from "../i18n/translate.ts"

function msg(key: string, params?: Record<string, string | number>): string {
  return translate(getCurrentLocale(), key, params)
}

export const LIMITS = {
  email: 254,
  passwordMin: 8,
  passwordMax: 128,
  fullName: 120,
  fullNameMin: 2,
  phone: 32,
  city: 100,
  bio: 5000,
  bioMin: 50,
  companyDescription: 5000,
  companyDescriptionMin: 30,
  professionalTitle: 120,
  jobTitle: 100,
  jobTitleMin: 3,
  jobDescription: 20_000,
  jobDescriptionMin: 100,
  listingTitle: 120,
  listingTitleMin: 3,
  listingDescription: 20_000,
  listingDescriptionMin: 10,
  chatMessage: 4000,
  chatMessageMin: 1,
  inquiryMessage: 5000,
  inquiryMessageMin: 10,
  coverLetter: 5000,
  coverLetterMin: 50,
  reviewText: 2000,
  reviewTextMin: 10,
  search: 100,
  tag: 50,
  tagsMax: 20,
  url: 2048,
  experienceTitle: 120,
  educationInstitution: 200,
  notificationTitle: 200,
  notificationBody: 2000,
  forumPostTitle: 200,
  forumPostTitleMin: 3,
  forumPostBody: 20_000,
  forumPostBodyMin: 10,
  forumComment: 4000,
  forumCommentMin: 1,
  slug: 80,
  moneyMax: 999_999_999,
  jsonBodyBytes: 256_000,
  uuid: 36,
} as const

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type FieldResult<T> = { ok: true; value: T } | { ok: false; message: string }

/** Strip HTML-like delimiters, NUL, and most C0 control chars (keep \\n, \\r, \\t). */
export function sanitizePlainText(raw: string): string {
  return raw
    .replace(/[<>]/g, "")
    .replace(/\0/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
}

/** For display-only fields: sanitize and trim; empty → null. */
export function sanitizeDisplayText(text: string | null | undefined): string | null {
  if (text == null) return null
  const cleaned = sanitizePlainText(text).trim()
  return cleaned.length > 0 ? cleaned : null
}

function fail(message: string): FieldResult<never> {
  return { ok: false, message }
}

export function validateUuid(raw: string, label = "ID"): FieldResult<string> {
  const t = raw.trim()
  if (!t) return fail(msg("validation.fieldRequired", { label }))
  if (t.length > LIMITS.uuid || !UUID_REGEX.test(t)) return fail(msg("validation.fieldInvalid", { label }))
  return { ok: true, value: t.toLowerCase() }
}

export function validateEmail(raw: string): FieldResult<string> {
  const t = sanitizePlainText(raw).trim()
  if (!t) return fail(msg("validation.emailRequired"))
  if (t.length > LIMITS.email) return fail(msg("validation.emailTooLong"))
  if (!EMAIL_REGEX.test(t)) return fail(msg("validation.emailInvalid"))
  return { ok: true, value: t }
}

/** Login only — verify presence and max length; policy is not enforced on sign-in. */
export function validatePasswordForLogin(raw: string): FieldResult<string> {
  if (typeof raw !== "string" || raw.length === 0) return fail(msg("validation.passwordRequired"))
  if (raw.length > LIMITS.passwordMax) return fail(msg("validation.passwordTooLong"))
  return { ok: true, value: raw }
}

/** Registration, password change, and password reset — full policy. */
export function validatePassword(raw: string): FieldResult<string> {
  if (typeof raw !== "string") return fail(msg("validation.passwordRequired"))
  if (raw.length > LIMITS.passwordMax) return fail(msg("validation.passwordTooLong"))
  if (raw.length < LIMITS.passwordMin || !/[A-Z]/.test(raw) || !/\d/.test(raw)) {
    return fail(msg("validation.passwordWeak"))
  }
  return { ok: true, value: raw }
}

export type TextFieldOpts = {
  min?: number
  max: number
  required?: boolean
  label: string
}

export function validateTextField(raw: string, opts: TextFieldOpts): FieldResult<string> {
  const cleaned = sanitizePlainText(raw).trim()
  const min = opts.min ?? (opts.required === false ? 0 : 1)
  if (!cleaned) {
    if (opts.required === false || min === 0) return { ok: true, value: "" }
    return fail(msg("validation.fieldRequired", { label: opts.label }))
  }
  if (cleaned.length < min) {
    return fail(msg("validation.fieldTooShort", { label: opts.label, min }))
  }
  if (cleaned.length > opts.max) {
    return fail(msg("validation.fieldTooLong", { label: opts.label, max: opts.max }))
  }
  return { ok: true, value: cleaned }
}

export function validateOptionalTextField(raw: string, opts: Omit<TextFieldOpts, "required">): FieldResult<string | null> {
  const cleaned = sanitizePlainText(raw).trim()
  if (!cleaned) return { ok: true, value: null }
  if (opts.min != null && cleaned.length < opts.min) {
    return fail(msg("validation.fieldTooShort", { label: opts.label, min: opts.min }))
  }
  if (cleaned.length > opts.max) return fail(msg("validation.fieldTooLong", { label: opts.label, max: opts.max }))
  return { ok: true, value: cleaned }
}

export function validateSearchQuery(raw: string): FieldResult<string> {
  return validateTextField(raw, { max: LIMITS.search, required: false, label: msg("common.search"), min: 0 })
}

/** Sanitized search string for URL/query params (empty when invalid). */
export function normalizeSearchInput(raw: string): string {
  const result = validateSearchQuery(raw)
  return result.ok ? result.value : ""
}

/** Safe https URL for rendering external links from stored DB values. */
export function safeExternalHref(raw: string | null | undefined): string | null {
  const result = validateOptionalUrl(raw)
  return result.ok ? result.value : null
}

export function validateMoneyAmount(
  raw: string | number,
  opts?: { min?: number; max?: number; label?: string },
): FieldResult<number | null> {
  const label = opts?.label ?? "თანხა"
  const min = opts?.min ?? 0
  const max = opts?.max ?? LIMITS.moneyMax
  if (raw === "" || raw == null) return { ok: true, value: null }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(/,/g, ""))
  if (!Number.isFinite(n)) return fail(`${label} არასწორია.`)
  if (n < min) return fail(`${label} მინიმუმ ${min} უნდა იყოს.`)
  if (n > max) return fail(`${label} ძალიან დიდია.`)
  return { ok: true, value: n }
}

export function validatePositiveInt(
  raw: string | number,
  opts: { min: number; max: number; label: string },
): FieldResult<number> {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw).trim(), 10)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fail(`${opts.label} მთელი რიცხვი უნდა იყოს.`)
  if (n < opts.min || n > opts.max) return fail(`${opts.label} ${opts.min}–${opts.max} დიაპაზონში უნდა იყოს.`)
  return { ok: true, value: n }
}

export function validateTags(raw: string[]): FieldResult<string[]> {
  if (raw.length > LIMITS.tagsMax) {
    return fail(`ტეგების მაქსიმუმ ${LIMITS.tagsMax} ცალია.`)
  }
  const out: string[] = []
  for (const tag of raw) {
    const r = validateTextField(tag, { max: LIMITS.tag, min: 1, label: "ტეგი" })
    if (!r.ok) return r
    if (!out.includes(r.value)) out.push(r.value)
  }
  return { ok: true, value: out }
}

/** Escape text for safe insertion into HTML email templates. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Same-site relative paths only; blocks external and protocol-relative URLs. */
export function sanitizeInternalPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("//")) return null
  if (/^https?:\/\//i.test(trimmed)) return null
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(path)) return null
  return path
}

export function validateOptionalUrl(raw: unknown): FieldResult<string | null> {
  if (raw == null || raw === "") return { ok: true, value: null }
  if (typeof raw !== "string") return fail("URL must be a string.")
  const t = sanitizePlainText(raw).trim()
  if (!t) return { ok: true, value: null }
  if (t.length > LIMITS.url) return fail("URL is too long.")
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(withProto)
    if (!/^https?:$/i.test(u.protocol) || !u.hostname) return fail("Invalid URL.")
    return { ok: true, value: u.toString() }
  } catch {
    return fail("Invalid URL.")
  }
}

export function assertField<T>(result: FieldResult<T>): T {
  if (!result.ok) throw new Error(result.message)
  return result.value
}

export function validateReviewComment(raw: string): FieldResult<string> {
  return validateTextField(raw, {
    min: LIMITS.reviewTextMin,
    max: LIMITS.reviewText,
    label: msg("nav.comment"),
  })
}

export function validateInquiryMessage(raw: string): FieldResult<string> {
  return validateTextField(raw, {
    min: LIMITS.inquiryMessageMin,
    max: LIMITS.inquiryMessage,
    label: msg("common.message"),
  })
}

export function validateJobTitle(raw: string): FieldResult<string> {
  return validateTextField(raw, {
    min: LIMITS.jobTitleMin,
    max: LIMITS.jobTitle,
    label: msg("common.title"),
  })
}

export function validateJobDescription(raw: string): FieldResult<string> {
  return validateTextField(raw, {
    min: LIMITS.jobDescriptionMin,
    max: LIMITS.jobDescription,
    label: msg("common.description"),
  })
}

export function validateListingTitle(raw: string): FieldResult<string> {
  return validateTextField(raw, {
    min: LIMITS.listingTitleMin,
    max: LIMITS.listingTitle,
    label: msg("common.title"),
  })
}

export function validateListingDescription(raw: string): FieldResult<string> {
  return validateTextField(raw, {
    min: LIMITS.listingDescriptionMin,
    max: LIMITS.listingDescription,
    label: msg("common.description"),
  })
}

export function validateCoverLetter(raw: string): FieldResult<string | null> {
  const cleaned = sanitizePlainText(raw).trim()
  if (!cleaned) return { ok: true, value: null }
  if (cleaned.length < LIMITS.coverLetterMin) {
    return fail(msg("validation.fieldTooShort", { label: msg("nav.comment"), min: LIMITS.coverLetterMin }))
  }
  if (cleaned.length > LIMITS.coverLetter) return fail(msg("validation.fieldTooLong", { label: msg("nav.comment"), max: LIMITS.coverLetter }))
  return { ok: true, value: cleaned }
}
