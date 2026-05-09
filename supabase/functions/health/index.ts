import { Redis } from "https://esm.sh/@upstash/redis@1.20.1"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
    })
  }

  const checks: Record<string, string> = {}
  let allOk = true

  // ── 1. Edge Function runtime ─────────────────────────────
  checks.edge = "ok"

  // ── 2. Database ──────────────────────────────────────────
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })
    const { error } = await admin.from("profiles").select("id").limit(1)
    if (error) throw new Error(error.message)
    checks.database = "ok"
  } catch (e) {
    checks.database = `error: ${e instanceof Error ? e.message : String(e)}`
    allOk = false
  }

  // ── 3. Redis ─────────────────────────────────────────────
  try {
    const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL")
    const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN")
    if (!redisUrl || !redisToken) throw new Error("Redis env missing")
    const redis = Redis.fromEnv()
    await redis.set("health:ping", "pong", { ex: 30 })
    const val = await redis.get("health:ping")
    if (val !== "pong") throw new Error("Redis ping failed")
    checks.redis = "ok"
  } catch (e) {
    checks.redis = `error: ${e instanceof Error ? e.message : String(e)}`
    allOk = false
  }

  return new Response(
    JSON.stringify({ ok: allOk, ts: new Date().toISOString(), checks }),
    {
      status: allOk ? 200 : 503,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  )
})