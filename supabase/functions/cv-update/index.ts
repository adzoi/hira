import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: {
    get: (key: string) => string | undefined
  }
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, PATCH, OPTIONS",
  "Content-Type": "application/json",
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
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
  const fullName = typeof cv?.full_name === "string" ? cv.full_name.trim() : ""
  const email = typeof cv?.email === "string" ? cv.email.trim() : ""

  if (fullName.length < 2) errors.push("Full name must be at least 2 characters.")
  if (email.length > 0 && !EMAIL_REGEX.test(email)) errors.push("Email must be a valid format.")
  return errors
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders })
  if (req.method !== "POST" && req.method !== "PATCH") {
    return jsonResponse({ errors: ["Method not allowed"] }, 405)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ errors: ["Missing Supabase environment variables."] }, 500)
  }

  const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  try {
    const token = getBearerToken(req)
    if (!token) return jsonResponse({ errors: ["Unauthorized"] }, 401)
    console.log("[cv-update] incoming auth header present:", Boolean(token))
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !authData.user) return jsonResponse({ errors: ["Unauthorized"] }, 401)
    console.log("[cv-update] authenticated user_id:", authData.user.id)

    const bodyRaw = await req.json().catch(() => null)
    if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
      return jsonResponse({ errors: ["Invalid request body"] }, 400)
    }
    const body = bodyRaw as Record<string, unknown>
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
      if (allowedColumns.has(key)) sanitizedBody[key] = value
    }

    if (Object.keys(sanitizedBody).length === 0) {
      return jsonResponse({ errors: ["No valid fields provided for update."] }, 400)
    }
    console.log("[cv-update] sanitized fields:", Object.keys(sanitizedBody))

    if ("full_name" in sanitizedBody || "email" in sanitizedBody) {
      const { data: existingCv, error: existingError } = await supabaseClient
        .from("user_cvs")
        .select("full_name,email")
        .eq("user_id", authData.user.id)
        .maybeSingle()
      if (existingError) return jsonResponse({ errors: [existingError.message] }, 500)

      const merged = {
        full_name: sanitizedBody.full_name ?? existingCv?.full_name ?? "",
        email: sanitizedBody.email ?? existingCv?.email ?? "",
        work_experience: [] as unknown[],
      }
      const validationErrors = validateCvPayload(merged)
      if (validationErrors.length > 0) return jsonResponse({ errors: validationErrors }, 400)
    }

    const upsertPayload = { user_id: authData.user.id, ...sanitizedBody }
    const { data: updatedCV, error: updateError } = await supabaseClient
      .from("user_cvs")
      .upsert(upsertPayload, { onConflict: "user_id" })
      .select()
      .single()

    if (updateError) {
      console.log("[cv-update] upsert error:", updateError)
      return jsonResponse({ errors: [updateError.message] }, 500)
    }
    console.log("[cv-update] upsert success user_id:", authData.user.id)
    return jsonResponse({ success: true, cv: updatedCV }, 200)
  } catch (error) {
    return jsonResponse(
      { errors: [error instanceof Error ? error.message : "Unknown error"] },
      500,
    )
  }
})

