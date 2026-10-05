/// <reference path="../esm-modules.d.ts" />
import { Redis } from "https://esm.sh/@upstash/redis@1.20.1"
import { enforceRateLimit } from "../_shared/rateLimit.ts"
import { corsHeadersFor } from "../_shared/cors.ts"
import { serveWithSentry } from "../_shared/sentry.ts"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}

serveWithSentry("health", async (req) => {
  const cors = corsHeadersFor(req)

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors })
  }

  if (req.method !== "GET" && req.method !== "OPTIONS") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  }

  const rateLimited = await enforceRateLimit(
    req,
    { prefix: "rl:health", requests: 10, window: "1 m", failClosed: true },
    cors,
  )
  if (rateLimited) return rateLimited

  const checks: Record<string, string> = {}
  let allOk = true

  checks.edge = "ok"

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
    console.error("[health] redis check failed", e)
    checks.redis = "error"
    allOk = false
  }

  return new Response(
    JSON.stringify({ ok: allOk, ts: new Date().toISOString(), checks }),
    {
      status: allOk ? 200 : 503,
      headers: { ...cors, "Content-Type": "application/json" },
    },
  )
})
