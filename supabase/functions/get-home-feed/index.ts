// @ts-ignore: URL imports are resolved at Supabase Edge runtime (Deno), not by local TS server.
import { enforceRateLimit, getRedis } from "../_shared/rateLimit.ts"
// @ts-ignore: URL imports are resolved at Supabase Edge runtime (Deno), not by local TS server.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
}

const CACHE_TTL = 60
const CACHE_KEY = "home:feed:v2"
// 10 requests per 10 seconds per IP
const RATE_LIMIT_REQUESTS = 10
const RATE_LIMIT_WINDOW = "10 s"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

type SuccessPayload = { ok: true; data: unknown }

function isCachedSuccessPayload(v: unknown): v is SuccessPayload {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return o.ok === true && "data" in o
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: "Missing Supabase env" }, 500)
  }

  const rateLimited = await enforceRateLimit(
    req,
    { prefix: "rl:home-feed", requests: RATE_LIMIT_REQUESTS, window: RATE_LIMIT_WINDOW },
    corsHeaders,
  )
  if (rateLimited) return rateLimited

  const redis = getRedis()

  if (redis) {
    try {
      const cached = await redis.get(CACHE_KEY)
      if (cached != null) {
        let parsed: unknown = cached
        if (typeof cached === "string") {
          try { parsed = JSON.parse(cached) } catch { parsed = null }
        }
        if (isCachedSuccessPayload(parsed)) return jsonResponse(parsed)
      }
    } catch {
      /* Redis read failed — fall through to RPC */
    }
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin.rpc("get_home_feed")
  if (error) return jsonResponse({ ok: false, error: error.message }, 500)

  const body: SuccessPayload = { ok: true, data }

  if (redis) {
    try {
      await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(body))
    } catch {
      /* ignore cache write failures */
    }
  }

  return jsonResponse(body)
})