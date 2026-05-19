import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"
import { enforceRateLimit } from "../_shared/rateLimit.ts"
import { corsHeadersFor } from "../_shared/cors.ts"
import { readJsonBody, validateTextField, validateUuid, escapeHtml } from "../_shared/validation.ts"

/** Gmail SMTP path: CTA always opens production dashboard (ASCII URL avoids client quirks). */
const GMAIL_CTA_DASHBOARD_URL = "https://gigori-production.up.railway.app/dashboard"

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  })
}

function isAuthorized(req: Request): boolean {
  const webhookSecret = Deno.env.get("EMAIL_WEBHOOK_SECRET")?.trim() ?? ""
  const webhookHeader = req.headers.get("X-Gigori-Webhook-Secret")?.trim() ?? ""
  if (webhookSecret && webhookHeader === webhookSecret) return true

  const authHeader = req.headers.get("Authorization") ?? ""
  if (!authHeader.startsWith("Bearer ")) return false
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? ""
  const bearerToken = authHeader.slice("Bearer ".length).trim()
  return Boolean(serviceRole && bearerToken === serviceRole)
}

/** Only same-origin relative paths; blocks external and protocol-relative URLs. */
function safeNotificationHref(linkRaw: string, siteUrl: string): string {
  const fallback = siteUrl ? `${siteUrl}/dashboard` : "/dashboard"
  const trimmed = linkRaw.trim()
  if (!trimmed) return fallback
  if (trimmed.startsWith("//")) return fallback
  if (/^https?:\/\//i.test(trimmed)) return fallback
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(path)) return fallback
  return siteUrl ? `${siteUrl}${path}` : path
}

type Body = {
  user_id?: string
  title?: string
  body?: string | null
  link?: string | null
  type?: string | null
  payload?: Record<string, unknown> | null
}

async function sendWithResend(params: {
  resendKey: string
  from: string
  to: string
  subject: string
  html: string
}): Promise<{ ok: true } | { ok: false; detail: string; status: number }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  })
  if (!res.ok) return { ok: false, detail: await res.text(), status: res.status }
  return { ok: true }
}

async function sendWithGmailSmtp(params: {
  to: string
  gmailUser: string
  gmailAppPassword: string
  fromHeader: string
}): Promise<{ ok: true } | { ok: false; detail: string }> {
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: {
        username: params.gmailUser,
        password: params.gmailAppPassword,
      },
    },
  })

  try {
    // Keep subject pure ASCII — no Georgian — to avoid denomailer encoding it badly
    const subject = "Gigori - New Notification"

    // All Georgian goes inside the HTML body which denomailer sends as quoted-printable
    // but Gmail renders correctly as long as the subject is ASCII
    const href = GMAIL_CTA_DASHBOARD_URL
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;">
    <div style="background:#0088FF;padding:16px 24px;">
      <span style="color:#fff;font-size:20px;font-weight:700;">Gigori</span>
    </div>
    <div style="padding:28px 24px;color:#1B2B4B;line-height:1.6;">
      <p style="font-size:15px;margin:0 0 20px;">You have a new notification on Gigori. Click below to check it.</p>
      <a href="${href}" style="display:inline-block;background:#0088FF;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:15px;">Check it</a>
    </div>
    <div style="padding:14px 24px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;">
      If you did not expect this email, you can ignore it.
    </div>
  </div>
</body>
</html>`

    await client.send({
      from: params.fromHeader,
      to: params.to,
      subject,
      html,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) }
  } finally {
    try { await client.close() } catch { /* ignore */ }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) })
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405)

  if (!isAuthorized(req)) return jsonResponse(req, { error: "Unauthorized" }, 401)
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? ""
  const gmailUser = Deno.env.get("GMAIL_SMTP_USER")?.trim() ?? ""
  const gmailAppPassword = Deno.env.get("GMAIL_SMTP_APP_PASSWORD")?.trim() ?? ""

  if (!resendKey && (!gmailUser || !gmailAppPassword)) {
    return jsonResponse(req, { error: "Email not configured" }, 503)
  }

  const bodyParsed = await readJsonBody(req)
  if (!bodyParsed.ok) {
    return jsonResponse(req, { error: bodyParsed.error }, bodyParsed.status)
  }
  const parsed = bodyParsed.value as Body

  const userIdResult = validateUuid(typeof parsed.user_id === "string" ? parsed.user_id : "", "user_id")
  if (!userIdResult.ok) return jsonResponse(req, { error: userIdResult.message }, 400)
  const userId = userIdResult.value

  if (parsed.title != null) {
    const titleResult = validateTextField(parsed.title, {
      max: 200,
      required: false,
      label: "title",
    })
    if (!titleResult.ok) return jsonResponse({ error: titleResult.message }, 400)
  }
  if (parsed.body != null && typeof parsed.body === "string" && parsed.body.trim()) {
    const bodyResult = validateTextField(parsed.body, {
      max: 2000,
      required: false,
      label: "body",
    })
    if (!bodyResult.ok) return jsonResponse({ error: bodyResult.message }, 400)
  }

  const linkRaw = parsed.link != null ? String(parsed.link).trim().slice(0, 2048) : ""

  const rateLimited = await enforceRateLimit(
    req,
    { prefix: "rl:send-notification-email", requests: 10, window: "1 m", key: userId, failClosed: true },
    corsHeaders,
  )
  if (rateLimited) return rateLimited

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
  if (!supabaseUrl || !serviceRole) return jsonResponse({ error: "Server misconfigured" }, 500)

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .maybeSingle()

  if (profileErr) return jsonResponse({ error: "Profile lookup failed" }, 500)
  if (!profile?.is_active) return jsonResponse({ ok: true, skipped: "inactive_profile" })

  const { data: adminUser, error: authErr } = await admin.auth.admin.getUserById(userId)
  if (authErr || !adminUser?.user?.email) return jsonResponse({ error: "User email not found" }, 404)

  const email = adminUser.user.email.trim()
  const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") ?? Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "")
  const href = safeNotificationHref(linkRaw, siteUrl)

  if (resendKey) {
    const from = Deno.env.get("RESEND_FROM")?.trim() || "Gigori <onboarding@resend.dev>"
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;">
    <div style="background:#0088FF;padding:16px 24px;">
      <span style="color:#fff;font-size:20px;font-weight:700;">Gigori</span>
    </div>
    <div style="padding:28px 24px;color:#1B2B4B;line-height:1.6;">
      <p style="font-size:15px;margin:0 0 20px;">You have a new notification on Gigori.</p>
      <a href="${escapeHtml(href)}" style="display:inline-block;background:#0088FF;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:15px;">Check it</a>
    </div>
    <div style="padding:14px 24px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;">
      If you did not expect this email, you can ignore it.
    </div>
  </div>
</body>
</html>`
    const r = await sendWithResend({ resendKey, from, to: email, subject: "Gigori - New Notification", html })
    if (!r.ok) {
      console.error("[send-notification-email] Resend:", r.status, r.detail)
      return jsonResponse({ error: "Resend failed", detail: r.detail }, 502)
    }
    return jsonResponse({ ok: true, transport: "resend" })
  }

  const fromHeader = Deno.env.get("GMAIL_SMTP_FROM")?.trim() || `Gigori <${gmailUser}>`
  const g = await sendWithGmailSmtp({ to: email, gmailUser, gmailAppPassword, fromHeader })
  if (!g.ok) {
    console.error("[send-notification-email] Gmail SMTP:", g.detail)
    return jsonResponse({ error: "SMTP send failed", detail: g.detail }, 502)
  }

  return jsonResponse({ ok: true, transport: "gmail_smtp" })
})