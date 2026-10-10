/// <reference path="../esm-modules.d.ts" />
// One reminder for people who signed up but never confirmed their email (24h-30d after signup).
// The link is a fresh sign-in link through /auth/confirm, which confirms the address and opens
// onboarding. Triggered hourly by pg_cron (public.trigger_confirm_reminders) with the shared
// webhook secret; can also be run manually with the service-role key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { escapeHtml } from "../_shared/validation.ts"
import { mailConfigured, sendMail } from "../_shared/mailer.ts"
import { logStructured } from "../_shared/structuredLog.ts"
import { serveWithSentry } from "../_shared/sentry.ts"

declare const Deno: {
  env: { get: (key: string) => string | undefined }
}

const FUNCTION_NAME = "send-confirm-reminders"
const SITE_URL = "https://hira.ge"
const BATCH_SIZE = 50

type ReminderRow = { user_id: string; email: string; full_name: string | null }

function isAuthorized(req: Request): boolean {
  const webhookSecret = Deno.env.get("EMAIL_WEBHOOK_SECRET")?.trim() ?? ""
  const webhookHeader = req.headers.get("X-Gigori-Webhook-Secret")?.trim() ?? ""
  if (webhookSecret && webhookHeader === webhookSecret) return true
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? ""
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim()
  return Boolean(serviceRole && bearer === serviceRole)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function buildEmail(firstName: string, link: string) {
  const greetingText = `გამარჯობა${firstName ? `, ${firstName}` : ""}!`
  const greeting = escapeHtml(greetingText)
  const html = `<!DOCTYPE html>
<html lang="ka">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;">
    <div style="background:#0088FF;padding:18px 24px;">
      <span style="color:#F7CE50;font-size:22px;font-weight:700;">ჰირა</span>
    </div>
    <div style="padding:28px 24px;color:#1B2B4B;line-height:1.55;">
      <p style="font-size:16px;margin:0 0 8px;">${greeting}</p>
      <p style="margin:0 0 8px;">ჰირაზე დარეგისტრირდი, მაგრამ ელფოსტა ჯერ არ დაგიდასტურებია, ამიტომ პროფილი ჯერ არ გაქვს.</p>
      <p style="margin:0;">ერთი დაჭერა და პროფილს ორ წუთში შექმნი: რას აკეთებ და რა უნარები გაქვს.</p>
      <a href="${escapeHtml(link)}" style="display:inline-block;margin-top:18px;background:#0088FF;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:15px;">ელფოსტის დადასტურება და პროფილის შექმნა</a>
      <p style="margin:18px 0 0;font-size:13px;color:#64748b;">ბმული ერთჯერადია. თუ ჰირაზე არ დარეგისტრირებულხარ, უბრალოდ უგულებელყავი ეს წერილი.</p>
    </div>
  </div>
</body>
</html>`
  const text = `${greetingText}

ჰირაზე დარეგისტრირდი, მაგრამ ელფოსტა ჯერ არ დაგიდასტურებია. დაადასტურე და შექმენი პროფილი:
${link}

თუ ჰირაზე არ დარეგისტრირებულხარ, უბრალოდ უგულებელყავი ეს წერილი.`
  return {
    subject: "დაადასტურე ელფოსტა და შექმენი პროფილი ჰირაზე",
    asciiSubject: "Confirm your email to finish your Hira profile",
    html,
    text,
  }
}

serveWithSentry(FUNCTION_NAME, async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401)
  if (!mailConfigured()) return json({ error: "Email not configured" }, 503)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? ""
  if (!supabaseUrl || !serviceRole) return json({ error: "Server misconfigured" }, 500)

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await admin.rpc("claim_confirm_reminder_batch", { p_limit: BATCH_SIZE })
  if (error) {
    logStructured("error", FUNCTION_NAME, "claim_failed", { error: error.message })
    return json({ error: "Claim failed" }, 500)
  }
  const rows = (data ?? []) as ReminderRow[]

  let sent = 0
  let failed = 0
  for (const row of rows) {
    // A fresh token: the original signup link may have expired by now.
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: row.email,
    })
    const tokenHash = link?.properties?.hashed_token
    const verificationType = link?.properties?.verification_type ?? "magiclink"
    if (linkError || !tokenHash) {
      failed++
      logStructured("error", FUNCTION_NAME, "link_failed", { user_id: row.user_id, error: linkError?.message ?? "no token" })
      // Release the claim so the next hourly run retries.
      await admin.from("email_confirm_reminders").delete().eq("user_id", row.user_id)
      continue
    }
    const confirmUrl = `${SITE_URL}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verificationType)}`
    const firstName = (row.full_name ?? "").trim().split(/\s+/)[0] ?? ""
    const email = buildEmail(firstName, confirmUrl)
    const result = await sendMail({ to: row.email, ...email })
    if (result.ok) {
      sent++
    } else {
      failed++
      logStructured("error", FUNCTION_NAME, "send_failed", { user_id: row.user_id, detail: result.detail })
      await admin.from("email_confirm_reminders").delete().eq("user_id", row.user_id)
    }
  }

  logStructured("info", FUNCTION_NAME, "reminder_run", { claimed: rows.length, sent, failed })
  return json({ claimed: rows.length, sent, failed })
})
