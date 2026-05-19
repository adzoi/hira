// @ts-ignore: Deno edge runtime resolves URL imports.
import { enforceAuthRateLimit } from "../_shared/rateLimit.ts"
import { readJsonBody, validateEmail, validatePassword } from "../_shared/validation.ts"
import { corsHeadersFor } from "../_shared/cors.ts"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}

function jsonResponse(req: Request, body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), ...extraHeaders },
  })
}

type LoginBody = {
  email?: string
  password?: string
}

Deno.serve(async (req) => {
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
  const body = parsed.value

  const emailResult = validateEmail(typeof body.email === "string" ? body.email : "")
  if (!emailResult.ok) {
    return jsonResponse(req, { ok: false, error: emailResult.message }, 400)
  }
  const passwordResult = validatePassword(typeof body.password === "string" ? body.password : "")
  if (!passwordResult.ok) {
    return jsonResponse(req, { ok: false, error: passwordResult.message }, 400)
  }
  const email = emailResult.value
  const password = passwordResult.value

  const rateLimited = await enforceAuthRateLimit(req, "rl:auth:login", corsHeadersFor(req), email)
  if (rateLimited) return rateLimited

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  if (!supabaseUrl || !anonKey) {
    return jsonResponse(req, { ok: false, error: "Server misconfiguration" }, 500)
  }

  const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  })

  const tokenBody = (await tokenRes.json().catch(() => ({}))) as Record<string, unknown>

  if (!tokenRes.ok) {
    const description =
      typeof tokenBody.error_description === "string"
        ? tokenBody.error_description
        : typeof tokenBody.msg === "string"
          ? tokenBody.msg
          : typeof tokenBody.error === "string"
            ? tokenBody.error
            : "Login failed"
    return jsonResponse(req, { ok: false, error: description }, tokenRes.status === 400 ? 401 : tokenRes.status)
  }

  const accessToken = typeof tokenBody.access_token === "string" ? tokenBody.access_token : ""
  const refreshToken = typeof tokenBody.refresh_token === "string" ? tokenBody.refresh_token : ""
  if (!accessToken || !refreshToken) {
    return jsonResponse(req, { ok: false, error: "Invalid auth response" }, 502)
  }

  return jsonResponse(req, {
    ok: true,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: tokenBody.expires_in ?? null,
    token_type: tokenBody.token_type ?? "bearer",
    user: tokenBody.user ?? null,
  })
})
