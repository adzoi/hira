/**
 * POST from DB trigger (pg_net) or server-side code when important notification events occur.
 * Sends HTML email via Resend when the recipient's profile has is_active = true.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

type Body = {
  user_id?: string
  title?: string
  body?: string | null
  link?: string | null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? ""
  const authHeader = req.headers.get("Authorization") ?? ""
  const token = authHeader.replace(/^Bearer\s+/i, "").trim()
  if (!serviceRole || token !== serviceRole) {
    return jsonResponse({ error: "Unauthorized" }, 401)
  }

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? ""
  if (!resendKey) {
    console.error("[send-notification-email] RESEND_API_KEY missing")
    return jsonResponse({ error: "Email not configured" }, 503)
  }

  let parsed: Body
  try {
    parsed = (await req.json()) as Body
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400)
  }

  const userId = typeof parsed.user_id === "string" ? parsed.user_id.trim() : ""
  const title = typeof parsed.title === "string" ? parsed.title.trim() : ""
  const bodyText = parsed.body != null ? String(parsed.body) : ""
  const linkRaw = parsed.link != null ? String(parsed.link).trim() : ""

  if (!userId || !title) {
    return jsonResponse({ error: "user_id and title are required" }, 400)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
  if (!supabaseUrl || !serviceRole) {
    return jsonResponse({ error: "Server misconfigured" }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .maybeSingle()

  if (profileErr) {
    console.error("[send-notification-email] profile:", profileErr.message)
    return jsonResponse({ error: "Profile lookup failed" }, 500)
  }

  if (!profile?.is_active) {
    return jsonResponse({ ok: true, skipped: "inactive_profile" })
  }

  const { data: adminUser, error: authErr } = await admin.auth.admin.getUserById(userId)
  if (authErr || !adminUser?.user?.email) {
    console.error("[send-notification-email] auth user:", authErr?.message)
    return jsonResponse({ error: "User email not found" }, 404)
  }

  const email = adminUser.user.email.trim()
  if (!email) {
    return jsonResponse({ error: "Empty email" }, 404)
  }

  const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") ?? Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "")
  const href =
    linkRaw && (linkRaw.startsWith("http://") || linkRaw.startsWith("https://"))
      ? linkRaw
      : linkRaw
        ? `${siteUrl}${linkRaw.startsWith("/") ? "" : "/"}${linkRaw}`
        : siteUrl || "#"

  const hrefAttr = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

  const from = Deno.env.get("RESEND_FROM")?.trim() || "Gigori <onboarding@resend.dev>"

  const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1B2B4B;">
  <h1 style="font-size:18px;">${escapeHtml(title)}</h1>
  ${bodyText ? `<p>${escapeHtml(bodyText)}</p>` : ""}
  <p><a href="${hrefAttr}" style="color:#D4A843;font-weight:600;">გადასვლა გიგორში</a></p>
</body></html>`

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: title,
      html,
    }),
  })

  if (!resendRes.ok) {
    const t = await resendRes.text()
    console.error("[send-notification-email] Resend:", resendRes.status, t)
    return jsonResponse({ error: "Resend failed", detail: t }, 502)
  }

  return jsonResponse({ ok: true })
})
