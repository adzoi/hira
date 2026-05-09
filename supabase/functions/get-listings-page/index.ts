import { Redis } from "https://esm.sh/@upstash/redis@1.20.1"
import { Ratelimit } from "https://esm.sh/@upstash/ratelimit@0.4.4"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
}

const CACHE_TTL = 30
const PAGE_SIZE = 20

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  })
}

type SuccessPayload = { ok: true; data: unknown }

function isCachedSuccessPayload(v: unknown): v is SuccessPayload {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return o.ok === true && "data" in o
}

function parsePage(raw: string | null): number {
  const n = Number.parseInt(raw ?? "1", 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

function normalizeCategory(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim()
  return s.length > 0 ? s : "all"
}

async function parseParams(req: Request): Promise<{ category: string; page: number }> {
  if (req.method === "GET") {
    const u = new URL(req.url)
    return {
      category: normalizeCategory(u.searchParams.get("category")),
      page: parsePage(u.searchParams.get("page")),
    }
  }
  try {
    const body = (await req.json()) as { category?: string | null; page?: unknown }
    const pageRaw =
      typeof body?.page === "number"
        ? String(body.page)
        : typeof body?.page === "string"
          ? body.page
          : "1"
    return {
      category: normalizeCategory(body?.category ?? ""),
      page: parsePage(pageRaw),
    }
  } catch {
    return { category: "all", page: 1 }
  }
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

  // ── Rate limiting ────────────────────────────────────────────────────────
  let redis: Redis | null = null
  try {
    if (Deno.env.get("UPSTASH_REDIS_REST_URL") && Deno.env.get("UPSTASH_REDIS_REST_TOKEN")) {
      redis = Redis.fromEnv()
    }
  } catch {
    redis = null
  }

  if (redis) {
    try {
      const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, "10 s"),
        analytics: false,
        prefix: "rl:listings-page",
      })
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        "anonymous"
      const { success } = await ratelimit.limit(ip)
      if (!success) {
        return jsonResponse({ ok: false, error: "Too many requests" }, 429)
      }
    } catch {
      // Fail open
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  const { category, page } = await parseParams(req)
  const cacheKey = `listings:page:${category}:${page}`

  if (redis) {
    try {
      const cached = await redis.get(cacheKey)
      if (cached != null) {
        let parsed: unknown = cached
        if (typeof cached === "string") {
          try {
            parsed = JSON.parse(cached)
          } catch {
            parsed = null
          }
        }
        if (isCachedSuccessPayload(parsed)) {
          return jsonResponse(parsed)
        }
      }
    } catch {
      /* Redis read failed — fall through to RPC */
    }
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const p_offset = (page - 1) * PAGE_SIZE

  const { data, error } = await admin.rpc("get_listings_page", {
    p_search: null,
    p_limit: PAGE_SIZE,
    p_offset,
  })

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 500)
  }

  const body: SuccessPayload = { ok: true, data }

  if (redis) {
    try {
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(body))
    } catch {
      /* ignore */
    }
  }

  return jsonResponse(body)
})