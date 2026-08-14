/// <reference path="../esm-modules.d.ts" />
import { Redis } from "https://esm.sh/@upstash/redis@1.20.1"
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

/** User content creation — keep DB insert triggers in sync with these values. */
export const CONTENT_RATE_LIMITS = {
  jobPost: { prefix: "rl:content:job-post", requests: 20, window: "1 h" },
  listingPost: { prefix: "rl:content:listing-post", requests: 20, window: "1 h" },
  messageConversation: { prefix: "rl:content:message:conv", requests: 5, window: "1 m" },
  messageGlobal: { prefix: "rl:content:message:user", requests: 30, window: "1 m" },
  serviceInquiry: { prefix: "rl:content:service-inquiry", requests: 20, window: "1 h" },
  jobApplication: { prefix: "rl:content:job-application", requests: 30, window: "1 h" },
  forumPost: { prefix: "rl:content:forum-post", requests: 20, window: "1 h" },
  forumComment: { prefix: "rl:content:forum-comment", requests: 60, window: "1 h" },
} as const

export type ContentRateLimitAction =
  | "job-post"
  | "listing-post"
  | "message"
  | "service-inquiry"
  | "job-application"
  | "forum-post"
  | "forum-comment"

const CONTENT_ACTION_LIMITS: Record<
  ContentRateLimitAction,
  { prefix: string; requests: number; window: string }
> = {
  "job-post": CONTENT_RATE_LIMITS.jobPost,
  "listing-post": CONTENT_RATE_LIMITS.listingPost,
  message: CONTENT_RATE_LIMITS.messageGlobal,
  "service-inquiry": CONTENT_RATE_LIMITS.serviceInquiry,
  "job-application": CONTENT_RATE_LIMITS.jobApplication,
  "forum-post": CONTENT_RATE_LIMITS.forumPost,
  "forum-comment": CONTENT_RATE_LIMITS.forumComment,
}

/** Authenticated content actions — Redis sliding window keyed by user id. */
export async function enforceContentRateLimit(
  req: Request,
  action: ContentRateLimitAction,
  userId: string,
  corsHeaders: Record<string, string>,
  opts?: { conversationId?: string },
): Promise<Response | null> {
  const limits = CONTENT_ACTION_LIMITS[action]
  const userLimited = await enforceRateLimit(
    req,
    {
      prefix: limits.prefix,
      requests: limits.requests,
      window: limits.window,
      key: userId,
      failClosed: true,
    },
    corsHeaders,
  )
  if (userLimited) return userLimited

  if (action === "message" && opts?.conversationId) {
    return enforceRateLimit(
      req,
      {
        prefix: CONTENT_RATE_LIMITS.messageConversation.prefix,
        requests: CONTENT_RATE_LIMITS.messageConversation.requests,
        window: CONTENT_RATE_LIMITS.messageConversation.window,
        key: `${userId}:${opts.conversationId}`,
        failClosed: true,
      },
      corsHeaders,
    )
  }

  return null
}

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
