/** Deno edge runtime — keep in sync with src/lib/validation.ts */

export const LIMITS = {
  email: 254,
  passwordMin: 8,
  passwordMax: 128,
  fullName: 120,
  fullNameMin: 2,
  phone: 32,
  city: 100,
  bio: 5000,
  jobTitle: 100,
  jobDescription: 20_000,
  chatMessage: 4000,
  url: 2048,
  search: 100,
  slug: 80,
  slugMin: 2,
  jsonBodyBytes: 256_000,
  uuid: 36,
  notificationTitle: 200,
  notificationBody: 2000,
  cvSummary: 5000,
  cvArrayMaxItems: 30,
  cvArrayItemMaxChars: 2000,
} as const

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type FieldResult<T> = { ok: true; value: T } | { ok: false; message: string }

export function sanitizePlainText(raw: string): string {
  return raw
    .replace(/[<>]/g, "")
    .replace(/\0/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function fail(message: string): FieldResult<never> {
  return { ok: false, message }
}

export function validateUuid(raw: string, label = "ID"): FieldResult<string> {
  const t = raw.trim()
  if (!t) return fail(`${label} is required.`)
  if (t.length > LIMITS.uuid || !UUID_REGEX.test(t)) return fail(`Invalid ${label}.`)
  return { ok: true, value: t.toLowerCase() }
}

export function validateEmail(raw: string): FieldResult<string> {
  const t = sanitizePlainText(raw).trim()
  if (!t) return fail("Email is required.")
  if (t.length > LIMITS.email) return fail("Email is too long.")
  if (!EMAIL_REGEX.test(t)) return fail("Invalid email format.")
  return { ok: true, value: t }
}

/** Login only — verify presence and max length; policy is not enforced on sign-in. */
export function validatePasswordForLogin(raw: string): FieldResult<string> {
  if (typeof raw !== "string" || raw.length === 0) return fail("Password is required.")
  if (raw.length > LIMITS.passwordMax) return fail("Password is too long.")
  return { ok: true, value: raw }
}

/** Registration, password change, and password reset — full policy. */
export function validatePassword(raw: string): FieldResult<string> {
  if (typeof raw !== "string") return fail("Password is required.")
  if (raw.length < LIMITS.passwordMin) return fail(`Password must be at least ${LIMITS.passwordMin} characters.`)
  if (raw.length > LIMITS.passwordMax) return fail("Password is too long.")
  if (!/[a-zA-Z]/.test(raw) || !/\d/.test(raw)) {
    return fail("Password must include at least one letter and one number.")
  }
  return { ok: true, value: raw }
}

export function validateTextField(
  raw: unknown,
  opts: { min?: number; max: number; required?: boolean; label: string },
): FieldResult<string> {
  if (typeof raw !== "string") {
    if (opts.required === false) return { ok: true, value: "" }
    return fail(`${opts.label} must be a string.`)
  }
  const cleaned = sanitizePlainText(raw).trim()
  const min = opts.min ?? (opts.required === false ? 0 : 1)
  if (!cleaned) {
    if (opts.required === false || min === 0) return { ok: true, value: "" }
    return fail(`${opts.label} is required.`)
  }
  if (cleaned.length < min) return fail(`${opts.label} must be at least ${min} characters.`)
  if (cleaned.length > opts.max) return fail(`${opts.label} exceeds ${opts.max} characters.`)
  return { ok: true, value: cleaned }
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

export function validateJsonArrayField(raw: unknown, label: string): FieldResult<unknown[] | null> {
  if (raw == null) return { ok: true, value: null }
  if (!Array.isArray(raw)) return fail(`${label} must be an array.`)
  if (raw.length > LIMITS.cvArrayMaxItems) return fail(`${label} has too many items.`)
  for (const item of raw) {
    const serialized = JSON.stringify(item)
    if (serialized.length > LIMITS.cvArrayItemMaxChars) {
      return fail(`${label} item is too large.`)
    }
  }
  return { ok: true, value: raw }
}

export async function readJsonBody(
  req: Request,
  maxBytes = LIMITS.jsonBodyBytes,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const contentLength = req.headers.get("content-length")
  if (contentLength) {
    const len = Number.parseInt(contentLength, 10)
    if (Number.isFinite(len) && len > maxBytes) {
      return { ok: false, status: 413, error: "Request body too large." }
    }
  }

  const raw = await req.text()
  if (raw.length > maxBytes) {
    return { ok: false, status: 413, error: "Request body too large." }
  }
  if (!raw.trim()) {
    return { ok: false, status: 400, error: "Empty request body." }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body." }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: "JSON body must be an object." }
  }

  return { ok: true, value: parsed as Record<string, unknown> }
}

export function parsePage(raw: unknown, maxPage = 500): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw.trim(), 10)
        : 1
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(Math.floor(n), maxPage)
}

export function normalizeCategory(raw: unknown): string {
  if (typeof raw !== "string") return "all"
  const s = sanitizePlainText(raw).trim().slice(0, LIMITS.uuid)
  return s.length > 0 ? s : "all"
}
