// @ts-ignore: URL imports are resolved at Supabase Edge runtime (Deno), not by local TS server.
import { getRedis, rateLimitAndReadCache, writeCacheInBackground } from "../_shared/rateLimit.ts"
// @ts-ignore: URL imports are resolved at Supabase Edge runtime (Deno), not by local TS server.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { corsHeadersFor } from "../_shared/cors.ts"
import { serveWithSentry } from "../_shared/sentry.ts"
import { requestLog } from "../_shared/structuredLog.ts"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}

const CACHE_TTL = 60
const CACHE_KEY = "home:feed:v2"
// 10 requests per 10 seconds per IP
const RATE_LIMIT_REQUESTS = 10
const RATE_LIMIT_WINDOW = "10 s"

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeadersFor(req, { "Content-Type": "application/json" }),
  })
}

type SuccessPayload = { ok: true; data: unknown }

function isCachedSuccessPayload(v: unknown): v is SuccessPayload {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return o.ok === true && "data" in o
}


serveWithSentry("get-home-feed", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeadersFor(req) })
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { ok: false, error: "Missing Supabase env" }, 500)
  }

  const redis = getRedis()
  const { limited, cached } = await rateLimitAndReadCache(
    req,
    { prefix: "rl:home-feed", requests: RATE_LIMIT_REQUESTS, window: RATE_LIMIT_WINDOW },
    corsHeadersFor(req),
    redis,
    CACHE_KEY,
  )
  if (limited) return limited
  if (isCachedSuccessPayload(cached)) return jsonResponse(req, cached)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })


  const { data, error } = await admin.rpc("get_home_feed")
  if (error) {
    requestLog(req)?.event("home_feed_rpc_failed", { error: error.message }, "error")
    return jsonResponse(req, { ok: false, error: "Internal server error" }, 500)
  }

  const body: SuccessPayload = { ok: true, data }

  writeCacheInBackground(redis, CACHE_KEY, CACHE_TTL, body)

  return jsonResponse(req, body)
})