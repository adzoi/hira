/// <reference path="../esm-modules.d.ts" />
// Turns off the weekly digest for one user, authorized by the HMAC token from the email.
// - POST JSON {u, t} from the hira.ge/unsubscribe confirmation page.
// - POST ?u=&t= with "List-Unsubscribe=One-Click" body from mail clients (RFC 8058).
// GET deliberately does nothing: link scanners prefetch email links.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { enforceRateLimit } from "../_shared/rateLimit.ts"
import { corsHeadersFor } from "../_shared/cors.ts"
import { safeEqual, unsubscribeSecret, unsubscribeToken } from "../_shared/mailer.ts"
import { logStructured } from "../_shared/structuredLog.ts"
import { serveWithSentry } from "../_shared/sentry.ts"

declare const Deno: {
  env: { get: (key: string) => string | undefined }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeadersFor(req, { "Content-Type": "application/json" }),
  })
}

async function readParams(req: Request): Promise<{ u: string; t: string }> {
  const url = new URL(req.url)
  let u = url.searchParams.get("u") ?? ""
  let t = url.searchParams.get("t") ?? ""
  if ((!u || !t) && (req.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      const body = (await req.json()) as Record<string, unknown>
      u = typeof body.u === "string" ? body.u : u
      t = typeof body.t === "string" ? body.t : t
    } catch {
      /* invalid body → rejected below */
    }
  }
  return { u: u.trim(), t: t.trim().toLowerCase() }
}

serveWithSentry("digest-unsubscribe", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeadersFor(req) })
  if (req.method !== "POST") return json(req, { ok: false, error: "Method not allowed" }, 405)

  const limited = await enforceRateLimit(
    req,
    { prefix: "rl:digest-unsubscribe", requests: 20, window: "1 m" },
    corsHeadersFor(req),
  )
  if (limited) return limited

  const { u, t } = await readParams(req)
  if (!UUID_RE.test(u) || !/^[0-9a-f]{64}$/.test(t) || !unsubscribeSecret()) {
    return json(req, { ok: false, error: "Invalid link" }, 400)
  }
  if (!safeEqual(await unsubscribeToken(u), t)) {
    return json(req, { ok: false, error: "Invalid link" }, 403)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? ""
  if (!supabaseUrl || !serviceRole) return json(req, { ok: false, error: "Server misconfigured" }, 500)

  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })
  const { error } = await admin.from("profiles").update({ weekly_digest_enabled: false }).eq("id", u)
  if (error) {
    logStructured("error", "digest-unsubscribe", "update_failed", { error: error.message })
    return json(req, { ok: false, error: "Update failed" }, 500)
  }
  return json(req, { ok: true })
})
