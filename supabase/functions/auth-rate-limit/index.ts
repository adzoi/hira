// @ts-ignore: Deno edge runtime resolves URL imports.
import { enforceAuthRateLimit } from "../_shared/rateLimit.ts"
import { readJsonBody, validateEmail } from "../_shared/validation.ts"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
}

const ALLOWED_ACTIONS = new Set(["register", "recover", "reauth"])

type Body = {
  action?: string
  email?: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405)
  }

  const parsed = await readJsonBody(req)
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: parsed.error }, parsed.status)
  }
  const body = parsed.value as Body

  const action = typeof body.action === "string" ? body.action.trim().toLowerCase().slice(0, 32) : ""
  if (!ALLOWED_ACTIONS.has(action)) {
    return jsonResponse({ ok: false, error: "Invalid action" }, 400)
  }

  let email: string | undefined
  if (typeof body.email === "string" && body.email.trim()) {
    const emailResult = validateEmail(body.email)
    if (!emailResult.ok) {
      return jsonResponse({ ok: false, error: emailResult.message }, 400)
    }
    email = emailResult.value
  }
  const rateLimited = await enforceAuthRateLimit(req, `rl:auth:${action}`, corsHeaders, email)
  if (rateLimited) return rateLimited

  return jsonResponse({ ok: true })
})
