import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { enforceRateLimit } from "../_shared/rateLimit.ts"
import {
  LIMITS,
  readJsonBody,
  sanitizePlainText,
  validateEmail,
  validateJsonArrayField,
  validateOptionalUrl,
  validateTextField,
} from "../_shared/validation.ts"
import { corsHeadersFor } from "../_shared/cors.ts"
import { requestLog } from "../_shared/structuredLog.ts"
import { serveWithSentry } from "../_shared/sentry.ts"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: {
    get: (key: string) => string | undefined
  }
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeadersFor(req) })
}

function getBearerToken(req: Request): string | null {
  const value = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!value) return null
  const [scheme, token] = value.split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !token) return null
  return token
}

function validateCvPayload(cv: Record<string, unknown>): string[] {
  const errors: string[] = []
  const fullNameResult = validateTextField(cv.full_name, {
    min: LIMITS.fullNameMin,
    max: LIMITS.fullName,
    label: "Full name",
  })
  if (!fullNameResult.ok) errors.push(fullNameResult.message)
  if (typeof cv.email === "string" && cv.email.trim()) {
    const emailResult = validateEmail(cv.email)
    if (!emailResult.ok) errors.push(emailResult.message)
  }
  return errors
}

function sanitizeCvField(key: string, value: unknown): unknown {
  if (typeof value === "string") {
    const max =
      key === "professional_summary"
        ? LIMITS.cvSummary
        : key.endsWith("_url")
          ? LIMITS.url
          : key === "custom_slug"
            ? LIMITS.slug
            : LIMITS.fullName
    const textResult = validateTextField(value, { max, required: false, label: key })
    return textResult.ok ? textResult.value : sanitizePlainText(value).slice(0, max)
  }
  if (key === "work_experience" || key === "education" || key === "technical_skills" || key === "soft_skills") {
    const arrResult = validateJsonArrayField(value, key)
    return arrResult.ok ? arrResult.value : null
  }
  if (key.endsWith("_url")) {
    const urlResult = validateOptionalUrl(value)
    return urlResult.ok ? urlResult.value : null
  }
  return value
}

serveWithSentry("cv-update", async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeadersFor(req) })
  if (req.method !== "POST" && req.method !== "PATCH") {
    return jsonResponse(req, { errors: ["Method not allowed"] }, 405)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { errors: ["Missing Supabase environment variables."] }, 500)
  }

  const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  try {
    const token = getBearerToken(req)
    if (!token) return jsonResponse(req, { errors: ["Unauthorized"] }, 401)
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !authData.user) return jsonResponse(req, { errors: ["Unauthorized"] }, 401)
    requestLog(req)?.set({ user_id: authData.user.id })

    const rateLimited = await enforceRateLimit(
      req,
      { prefix: "rl:cv-update", requests: 30, window: "1 m", key: authData.user.id },
      corsHeadersFor(req),
    )
    if (rateLimited) return rateLimited

    const parsed = await readJsonBody(req)
    if (!parsed.ok) {
      return jsonResponse(req, { errors: [parsed.error] }, parsed.status)
    }
    const body = parsed.value
    const allowedColumns = new Set([
      "full_name",
      "email",
      "phone",
      "location",
      "linkedin_url",
      "github_url",
      "portfolio_url",
      "avatar_url",
      "hourly_rate",
      "languages",
      "professional_summary",
      "work_experience",
      "education",
      "technical_skills",
      "soft_skills",
      "is_visible_on_profile",
      "is_public",
      "custom_slug",
    ])
    const sanitizedBody: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body)) {
      if (allowedColumns.has(key)) sanitizedBody[key] = sanitizeCvField(key, value)
    }

    if (Object.keys(sanitizedBody).length === 0) {
      return jsonResponse(req, { errors: ["No valid fields provided for update."] }, 400)
    }

    if ("full_name" in sanitizedBody || "email" in sanitizedBody) {
      const { data: existingCv, error: existingError } = await supabaseClient
        .from("user_cvs")
        .select("full_name,email")
        .eq("user_id", authData.user.id)
        .maybeSingle()
      if (existingError) return jsonResponse(req, { errors: [existingError.message] }, 500)

      const merged = {
        full_name: sanitizedBody.full_name ?? existingCv?.full_name ?? "",
        email: sanitizedBody.email ?? existingCv?.email ?? "",
        work_experience: [] as unknown[],
      }
      const validationErrors = validateCvPayload(merged)
      if (validationErrors.length > 0) return jsonResponse(req, { errors: validationErrors }, 400)
    }

    const upsertPayload = { user_id: authData.user.id, ...sanitizedBody }
    const { data: updatedCV, error: updateError } = await supabaseClient
      .from("user_cvs")
      .upsert(upsertPayload, { onConflict: "user_id" })
      .select()
      .single()

    if (updateError) {
      requestLog(req)?.event("cv_upsert_failed", { error: updateError.message }, "error")
      return jsonResponse(req, { errors: [updateError.message] }, 500)
    }
    return jsonResponse(req, { success: true, cv: updatedCV }, 200)
  } catch (error) {
    return jsonResponse(req, 
      { errors: [error instanceof Error ? error.message : "Unknown error"] },
      500,
    )
  }
})

