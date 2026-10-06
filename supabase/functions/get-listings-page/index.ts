import { getRedis, rateLimitAndReadCache, writeCacheInBackground } from "../_shared/rateLimit.ts"
import { normalizeCategory, parsePage, readJsonBody } from "../_shared/validation.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { corsHeadersFor } from "../_shared/cors.ts"
import { serveWithSentry } from "../_shared/sentry.ts"
import { requestLog } from "../_shared/structuredLog.ts"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}

const CACHE_TTL = 30
const PAGE_SIZE = 20

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

function normalizeSearch(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const s = raw.trim().slice(0, 100)
  return s.length > 0 ? s : null
}

async function parseParams(req: Request): Promise<{ category: string; page: number; search: string | null }> {
  if (req.method === "GET") {
    const u = new URL(req.url)
    return {
      category: normalizeCategory(u.searchParams.get("category")),
      page: parsePage(u.searchParams.get("page")),
      search: normalizeSearch(u.searchParams.get("search") ?? u.searchParams.get("q")),
    }
  }
  const parsed = await readJsonBody(req)
  if (!parsed.ok) return { category: "all", page: 1, search: null }
  const body = parsed.value
  return {
    category: normalizeCategory(body.category),
    page: parsePage(body.page),
    search: normalizeSearch(body.search ?? body.q ?? body.searchQuery),
  }
}

serveWithSentry("get-listings-page", async (req) => {
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

  // Params first so the cache key is known; the rate-limit check and cache read then run in parallel.
  const { category, page, search } = await parseParams(req)
  const cacheKey = `listings:page:${category}:${page}:${search ?? ""}`

  const { limited, cached } = await rateLimitAndReadCache(
    req,
    { prefix: "rl:listings-page", requests: 20, window: "10 s" },
    corsHeadersFor(req),
    redis,
    cacheKey,
  )
  if (limited) return limited
  if (isCachedSuccessPayload(cached)) return jsonResponse(req, cached)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const p_offset = (page - 1) * PAGE_SIZE

  const { data, error } = await admin.rpc("get_listings_page", {
    p_search: search,
    p_limit: PAGE_SIZE,
    p_offset,
  })

  if (error) {
    requestLog(req)?.event("listings_page_rpc_failed", { error: error.message }, "error")
    return jsonResponse(req, { ok: false, error: "Internal server error" }, 500)
  }

  const body: SuccessPayload = { ok: true, data }

  writeCacheInBackground(redis, cacheKey, CACHE_TTL, body)

  return jsonResponse(req, body)
})