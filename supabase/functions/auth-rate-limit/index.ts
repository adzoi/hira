// @ts-ignore: Deno edge runtime resolves URL imports.
import { enforceRateLimit } from "../_shared/rateLimit.ts"
import { corsHeadersFor } from "../_shared/cors.ts"
import { readJsonBody, validateEmail } from "../_shared/validation.ts"
import { requestLog } from "../_shared/structuredLog.ts"
import { serveWithSentry } from "../_shared/sentry.ts"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

const ALLOWED_ACTIONS = new Set(["register", "recover", "reauth"])

type Body = {
  action?: string
  email?: string
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  })
}

serveWithSentry("auth-rate-limit", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeadersFor(req) })
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405)
  }

  const parsed = await readJsonBody(req)
  if (!parsed.ok) {
    return jsonResponse(req, { ok: false, error: parsed.error }, parsed.status)
  }
  const body = parsed.value as Body

  const action = typeof body.action === "string" ? body.action.trim().toLowerCase().slice(0, 32) : ""
  if (!ALLOWED_ACTIONS.has(action)) {
    return jsonResponse(req, { ok: false, error: "Invalid action" }, 400)
  }

  requestLog(req)?.set({ action })

  if (typeof body.email === "string" && body.email.trim()) {
    const emailResult = validateEmail(body.email)
    if (!emailResult.ok) {
      return jsonResponse(req, { ok: false, error: emailResult.message }, 400)
    }
  }

  // Pre-check endpoint: IP-only limit so attackers cannot exhaust another user's email bucket.
  const rateLimited = await enforceRateLimit(
    req,
    { prefix: `rl:auth:${action}:precheck`, requests: 20, window: "15 m", failClosed: true },
    corsHeadersFor(req),
  )
  if (rateLimited) return rateLimited

  return jsonResponse(req, { ok: true })
})
