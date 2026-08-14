// @ts-ignore: Deno edge runtime resolves URL imports.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { enforceContentRateLimit, type ContentRateLimitAction } from "../_shared/rateLimit.ts"
import { corsHeadersFor } from "../_shared/cors.ts"
import { readJsonBody } from "../_shared/validation.ts"
import { requestLog } from "../_shared/structuredLog.ts"
import { serveWithSentry } from "../_shared/sentry.ts"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}

const ALLOWED_ACTIONS = new Set<ContentRateLimitAction>([
  "job-post",
  "listing-post",
  "message",
  "service-inquiry",
  "job-application",
  "forum-post",
  "forum-comment",
])

type Body = {
  action?: string
  conversationId?: string
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  })
}

function getBearerToken(req: Request): string | null {
  const value = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!value) return null
  const [scheme, token] = value.split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !token) return null
  return token
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

serveWithSentry("content-rate-limit", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeadersFor(req) })
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405)
  }

  const token = getBearerToken(req)
  if (!token) {
    return jsonResponse(req, { ok: false, error: "Unauthorized" }, 401)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { ok: false, error: "Server misconfiguration" }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  if (authError || !authData.user?.id) {
    return jsonResponse(req, { ok: false, error: "Unauthorized" }, 401)
  }

  requestLog(req)?.set({ user_id: authData.user.id })

  const parsed = await readJsonBody(req)
  if (!parsed.ok) {
    return jsonResponse(req, { ok: false, error: parsed.error }, parsed.status)
  }
  const body = parsed.value as Body

  const actionRaw = typeof body.action === "string" ? body.action.trim().toLowerCase() : ""
  if (!ALLOWED_ACTIONS.has(actionRaw as ContentRateLimitAction)) {
    return jsonResponse(req, { ok: false, error: "Invalid action" }, 400)
  }
  const action = actionRaw as ContentRateLimitAction
  requestLog(req)?.set({ action })

  let conversationId: string | undefined
  if (action === "message") {
    const raw = typeof body.conversationId === "string" ? body.conversationId.trim() : ""
    if (!isUuid(raw)) {
      return jsonResponse(req, { ok: false, error: "conversationId is required for message" }, 400)
    }
    conversationId = raw
    requestLog(req)?.set({ conversation_id: conversationId })
  }

  const rateLimited = await enforceContentRateLimit(
    req,
    action,
    authData.user.id,
    corsHeadersFor(req),
    { conversationId },
  )
  if (rateLimited) return rateLimited

  return jsonResponse(req, { ok: true })
})
