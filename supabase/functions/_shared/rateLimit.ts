// @ts-ignore: URL imports are resolved at Supabase Edge runtime (Deno).
import { Redis } from "https://esm.sh/@upstash/redis@1.20.1"
// @ts-ignore: URL imports are resolved at Supabase Edge runtime (Deno).
import { Ratelimit } from "https://esm.sh/@upstash/ratelimit@0.4.4"

declare const Deno: {
  env: { get: (key: string) => string | undefined }
}

export type RateLimitOptions = {
  prefix: string
  requests: number
  window: string
  key?: string
  /** When Redis is unavailable or the check errors — block (auth) vs allow (public reads). */
  failClosed?: boolean
}

export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous"
  )
}

export function getRedis(): Redis | null {
  try {
    if (Deno.env.get("UPSTASH_REDIS_REST_URL") && Deno.env.get("UPSTASH_REDIS_REST_TOKEN")) {
      return Redis.fromEnv()
    }
  } catch {
    // ignore
  }
  return null
}

function rateLimitResponse(
  corsHeaders: Record<string, string> | undefined,
  retryAfterSeconds: number,
  message = "Too many requests",
): Response {
  const headers: Record<string, string> = {
    ...(corsHeaders ?? {}),
    "Content-Type": "application/json",
    "Retry-After": String(Math.max(1, retryAfterSeconds)),
  }
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 429,
    headers,
  })
}

/** Returns a 429/503 Response when limited, or null when the request may proceed. */
export async function enforceRateLimit(
  req: Request,
  opts: RateLimitOptions,
  corsHeaders?: Record<string, string>,
): Promise<Response | null> {
  const redis = getRedis()
  if (!redis) {
    if (opts.failClosed) {
      return new Response(JSON.stringify({ ok: false, error: "Rate limit unavailable" }), {
        status: 503,
        headers: { ...(corsHeaders ?? {}), "Content-Type": "application/json" },
      })
    }
    return null
  }

  try {
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(opts.requests, opts.window),
      analytics: false,
      prefix: opts.prefix,
    })
    const key = opts.key ?? getClientIp(req)
    const { success, reset } = await ratelimit.limit(key)
    if (!success) {
      const retryAfterSeconds = Math.ceil((reset - Date.now()) / 1000)
      return rateLimitResponse(corsHeaders, retryAfterSeconds)
    }
  } catch {
    if (opts.failClosed) {
      return new Response(JSON.stringify({ ok: false, error: "Rate limit unavailable" }), {
        status: 503,
        headers: { ...(corsHeaders ?? {}), "Content-Type": "application/json" },
      })
    }
  }

  return null
}

/** Auth routes: 5 attempts per 15 minutes (per IP and optionally per email). */
export const AUTH_RATE_LIMIT = {
  requests: 5,
  window: "15 m",
} as const

export async function enforceAuthRateLimit(
  req: Request,
  prefix: string,
  corsHeaders: Record<string, string>,
  email?: string,
): Promise<Response | null> {
  const ipLimited = await enforceRateLimit(
    req,
    {
      prefix: `${prefix}:ip`,
      requests: AUTH_RATE_LIMIT.requests,
      window: AUTH_RATE_LIMIT.window,
      failClosed: true,
    },
    corsHeaders,
  )
  if (ipLimited) return ipLimited

  const normalizedEmail = email?.trim().toLowerCase()
  if (!normalizedEmail) return null

  return enforceRateLimit(
    req,
    {
      prefix: `${prefix}:email`,
      requests: AUTH_RATE_LIMIT.requests,
      window: AUTH_RATE_LIMIT.window,
      key: normalizedEmail,
      failClosed: true,
    },
    corsHeaders,
  )
}
