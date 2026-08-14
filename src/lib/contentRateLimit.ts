import { isSupabaseConfigured, supabase } from "./supabase"
import { supabaseEdgeHeaders } from "./supabaseEdgeHeaders"

export type ContentRateLimitAction =
  | "job-post"
  | "listing-post"
  | "message"
  | "service-inquiry"
  | "job-application"
  | "forum-post"
  | "forum-comment"

function functionsBaseUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL ?? ""
  return `${base.replace(/\/$/, "")}/functions/v1`
}

export function isContentRateLimited(status?: number, message?: string): boolean {
  if (status === 429) return true
  const lower = message?.toLowerCase() ?? ""
  return lower.includes("too many") || lower.includes("rate limit")
}

export function contentRateLimitMessage(retryAfterSeconds: number, fallback: string): string {
  if (retryAfterSeconds > 0 && retryAfterSeconds < 3600) {
    return fallback.replace("{seconds}", String(retryAfterSeconds))
  }
  return fallback.replace("{seconds}", "60")
}

/** Consume one content-creation attempt before a direct Supabase insert. */
export async function consumeContentRateLimit(
  action: ContentRateLimitAction,
  opts?: { conversationId?: string },
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, retryAfterSeconds: 60 }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const accessToken = session?.access_token ?? null

  const body: Record<string, string> = { action }
  if (action === "message" && opts?.conversationId) {
    body.conversationId = opts.conversationId
  }

  const res = await fetch(`${functionsBaseUrl()}/content-rate-limit`, {
    method: "POST",
    headers: supabaseEdgeHeaders(accessToken),
    body: JSON.stringify(body),
  })

  if (res.ok) return { ok: true }

  const retryAfter = Number.parseInt(res.headers.get("Retry-After") ?? "", 10)
  return {
    ok: false,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60,
  }
}

export class ContentRateLimitError extends Error {
  retryAfterSeconds: number

  constructor(retryAfterSeconds: number, message = "Too many requests") {
    super(message)
    this.name = "ContentRateLimitError"
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** Call before insert; throws ContentRateLimitError on 429. */
export async function assertContentRateLimit(
  action: ContentRateLimitAction,
  opts?: { conversationId?: string },
): Promise<void> {
  const result = await consumeContentRateLimit(action, opts)
  if (!result.ok) {
    throw new ContentRateLimitError(result.retryAfterSeconds)
  }
}

/** Map Supabase/Postgres insert errors that slipped past the edge pre-check. */
export function parseContentRateLimitFromError(error: unknown): ContentRateLimitError | null {
  if (error instanceof ContentRateLimitError) return error
  if (!error || typeof error !== "object") return null
  const message = "message" in error && typeof error.message === "string" ? error.message : ""
  if (!isContentRateLimited(undefined, message)) return null
  return new ContentRateLimitError(60, message)
}

export function formatContentRateLimitError(
  error: unknown,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  const limited =
    error instanceof ContentRateLimitError ? error : parseContentRateLimitFromError(error)
  if (!limited) return null
  return t("validation.rateLimitedSeconds", { seconds: limited.retryAfterSeconds })
}
