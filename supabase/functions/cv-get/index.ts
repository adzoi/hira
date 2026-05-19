import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { enforceRateLimit } from "../_shared/rateLimit.ts"
import { corsHeadersFor } from "../_shared/cors.ts"

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeadersFor(req) })
  if (req.method !== "GET") return jsonResponse(req, { errors: ["Method not allowed"] }, 405)

  const rateLimited = await enforceRateLimit(
    req,
    { prefix: "rl:cv-get", requests: 60, window: "1 m" },
    corsHeadersFor(req),
  )
  if (rateLimited) return rateLimited

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { errors: ["Missing Supabase environment variables."] }, 500)
  }

  const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
  const url = new URL(req.url)
  const slug = (url.searchParams.get("slug") ?? "").trim()
  const userId = (url.searchParams.get("user_id") ?? "").trim()

  try {
    if (slug) {
      if (slug.length < 2) return jsonResponse(req, { errors: ["Slug must be at least 2 characters."] }, 400)

      const { data: publicCV, error: publicError } = await supabaseClient
        .from("user_cvs")
        .select("*")
        .eq("custom_slug", slug)
        .eq("is_public", true)
        .maybeSingle()

      if (publicError) return jsonResponse(req, { errors: [publicError.message] }, 500)
      if (!publicCV) return jsonResponse(req, { errors: ["CV not found"] }, 404)
      return jsonResponse(req, { cv: publicCV }, 200)
    }

    if (userId) {
      const { data: publicVisibleCv, error: publicVisibleError } = await supabaseClient
        .from("user_cvs")
        .select("*")
        .eq("user_id", userId)
        .eq("is_public", true)
        .eq("is_visible_on_profile", true)
        .maybeSingle()
      if (publicVisibleError) return jsonResponse(req, { errors: [publicVisibleError.message] }, 500)
      return jsonResponse(req, { cv: publicVisibleCv ?? null }, 200)
    }

    const token = getBearerToken(req)
    if (!token) return jsonResponse(req, { errors: ["Unauthorized"] }, 401)
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !authData.user) return jsonResponse(req, { errors: ["Unauthorized"] }, 401)

    const { data: ownCV, error: ownError } = await supabaseClient
      .from("user_cvs")
      .select("*")
      .eq("user_id", authData.user.id)
      .maybeSingle()

    if (ownError) {
      const code = typeof ownError.code === "string" ? ownError.code : ""
      if (code === "PGRST116") return jsonResponse(req, { cv: null }, 200)
      return jsonResponse(req, { errors: [ownError.message] }, 500)
    }

    return jsonResponse(req, { cv: ownCV ?? null }, 200)
  } catch (error) {
    return jsonResponse(req, 
      { errors: [error instanceof Error ? error.message : "Unknown error"] },
      500,
    )
  }
})

