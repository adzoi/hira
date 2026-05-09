import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
}

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders })
  if (req.method !== "GET") return jsonResponse({ errors: ["Method not allowed"] }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ errors: ["Missing Supabase environment variables."] }, 500)
  }

  const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
  const url = new URL(req.url)
  const slug = (url.searchParams.get("slug") ?? "").trim()
  const userId = (url.searchParams.get("user_id") ?? "").trim()

  try {
    if (slug) {
      if (slug.length < 2) return jsonResponse({ errors: ["Slug must be at least 2 characters."] }, 400)

      const { data: publicCV, error: publicError } = await supabaseClient
        .from("user_cvs")
        .select("*")
        .eq("custom_slug", slug)
        .eq("is_public", true)
        .maybeSingle()

      if (publicError) return jsonResponse({ errors: [publicError.message] }, 500)
      if (!publicCV) return jsonResponse({ errors: ["CV not found"] }, 404)
      return jsonResponse({ cv: publicCV }, 200)
    }

    if (userId) {
      const { data: publicVisibleCv, error: publicVisibleError } = await supabaseClient
        .from("user_cvs")
        .select("*")
        .eq("user_id", userId)
        .eq("is_public", true)
        .eq("is_visible_on_profile", true)
        .maybeSingle()
      if (publicVisibleError) return jsonResponse({ errors: [publicVisibleError.message] }, 500)
      return jsonResponse({ cv: publicVisibleCv ?? null }, 200)
    }

    const token = getBearerToken(req)
    if (!token) return jsonResponse({ errors: ["Unauthorized"] }, 401)
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !authData.user) return jsonResponse({ errors: ["Unauthorized"] }, 401)

    const { data: ownCV, error: ownError } = await supabaseClient
      .from("user_cvs")
      .select("*")
      .eq("user_id", authData.user.id)
      .maybeSingle()

    if (ownError) {
      const code = typeof ownError.code === "string" ? ownError.code : ""
      if (code === "PGRST116") return jsonResponse({ cv: null }, 200)
      return jsonResponse({ errors: [ownError.message] }, 500)
    }

    return jsonResponse({ cv: ownCV ?? null }, 200)
  } catch (error) {
    return jsonResponse(
      { errors: [error instanceof Error ? error.message : "Unknown error"] },
      500,
    )
  }
})

