// @ts-ignore: Deno remote module resolution is handled at runtime.
import { enforceRateLimit, getRedis } from "../_shared/rateLimit.ts"
import { normalizeCategory, parsePage, readJsonBody } from "../_shared/validation.ts"
// @ts-ignore: Deno remote module resolution is handled at runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { corsHeadersFor } from "../_shared/cors.ts"

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

type DenoLike = {
  env?: {
    get: (key: string) => string | undefined
  }
  serve?: (handler: (req: Request) => Response | Promise<Response>) => void
}

const denoRuntime = (globalThis as typeof globalThis & { Deno?: DenoLike }).Deno

if (!denoRuntime?.serve) {
  throw new Error("Deno.serve is unavailable in this runtime")
}

function getEnv(name: string): string {
  return denoRuntime?.env?.get(name) ?? ""
}

async function deleteExpiredJobs(admin: ReturnType<typeof createClient>): Promise<void> {
  const nowIso = new Date().toISOString()
  const todayIso = nowIso.slice(0, 10)

  const { error } = await admin
    .from("jobs")
    .delete()
    .eq("status", "open")
    .or(`application_deadline.lt.${todayIso},expires_at.lte.${nowIso}`)

  if (error) {
    throw new Error(`Expired jobs cleanup failed: ${error.message}`)
  }
}

async function parseParams(req: Request): Promise<{ category: string; page: number }> {
  if (req.method === "GET") {
    const u = new URL(req.url)
    return {
      category: normalizeCategory(u.searchParams.get("category")),
      page: parsePage(u.searchParams.get("page")),
    }
  }
  const parsed = await readJsonBody(req)
  if (!parsed.ok) return { category: "all", page: 1 }
  const body = parsed.value
  return {
    category: normalizeCategory(body.category),
    page: parsePage(body.page),
  }
}

denoRuntime.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeadersFor(req) })
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405)
  }

  const supabaseUrl = getEnv("SUPABASE_URL")
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { ok: false, error: "Missing Supabase env" }, 500)
  }

  const rateLimited = await enforceRateLimit(
    req,
    { prefix: "rl:jobs-page", requests: 20, window: "10 s" },
    corsHeadersFor(req),
  )
  if (rateLimited) return rateLimited

  const redis = getRedis()

  const { category, page } = await parseParams(req)
  const cacheKey = `jobs:page:${category}:${page}`

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
          return jsonResponse(req, parsed)
        }
      }
    } catch {
      /* Redis read failed — fall through to RPC */
    }
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  try {
    await deleteExpiredJobs(admin)
  } catch {
    /* Non-fatal: catalog should still load if cleanup fails */
  }

  const p_category_id = category === "all" ? null : category
  const p_offset = (page - 1) * PAGE_SIZE

  const { data, error } = await admin.rpc("get_jobs_page", {
    p_search: null,
    p_limit: PAGE_SIZE,
    p_offset,
    p_category_id,
  })

  if (error) {
    return jsonResponse(req, { ok: false, error: error.message }, 500)
  }

  const body: SuccessPayload = { ok: true, data }

  if (redis) {
    try {
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(body))
    } catch {
      /* ignore */
    }
  }

  return jsonResponse(req, body)
})