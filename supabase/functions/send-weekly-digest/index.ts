/// <reference path="../esm-modules.d.ts" />
// Weekly "new jobs in your field" digest. Triggered by pg_cron (public.trigger_weekly_digest)
// with the shared webhook secret; can also be run manually with the service-role key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { escapeHtml } from "../_shared/validation.ts"
import { mailConfigured, sendMail, unsubscribeSecret, unsubscribeToken } from "../_shared/mailer.ts"
import { logStructured } from "../_shared/structuredLog.ts"
import { serveWithSentry } from "../_shared/sentry.ts"

declare const Deno: {
  env: { get: (key: string) => string | undefined }
}

const FUNCTION_NAME = "send-weekly-digest"
const SITE_URL = "https://hira.ge"
const BATCH_SIZE = 50
/** Stay well inside the edge function wall-clock limit; leftovers go out on the next cron run. */
const TIME_BUDGET_MS = 100_000

type DigestJob = {
  id: string
  title: string
  budget_type: string | null
  budget_min: number | null
  budget_max: number | null
  location_type: string | null
}

type DigestRow = {
  user_id: string
  email: string
  full_name: string | null
  job_count: number
  jobs: DigestJob[] | null
}

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

const PERIOD: Record<string, string> = { hourly: "/საათი", monthly: "/თვე" }
const LOCATION: Record<string, string> = {
  remote: "დისტანციური",
  hybrid: "ჰიბრიდული",
  tbilisi: "თბილისი",
  anywhere: "ნებისმიერი ადგილი",
}

function money(value: number): string {
  return `${Math.round(value).toLocaleString("en-US").replace(/,/g, " ")} ₾`
}

function budget(job: DigestJob): string {
  const min = job.budget_min ?? job.budget_max
  const max = job.budget_max ?? job.budget_min
  if (min == null || max == null) return "ფასი შეთანხმებით"
  const period = PERIOD[job.budget_type ?? ""] ?? ""
  if (min !== max && !period) return `${money(min)} – ${money(max)}`
  return `${money(min)}${period}`
}

function jobCountPhrase(count: number): string {
  return count === 1 ? "1 ახალი სამუშაო" : `${count} ახალი სამუშაო`
}

function buildEmail(row: DigestRow, unsubscribeUrl: string): { subject: string; asciiSubject: string; html: string; text: string } {
  const firstName = (row.full_name ?? "").trim().split(/\s+/)[0] ?? ""
  const jobs = row.jobs ?? []
  const utm = "utm_source=digest&utm_medium=email&utm_campaign=weekly"
  const subject = `${jobCountPhrase(row.job_count)} შენს სფეროში ამ კვირაში`
  const asciiSubject = `Hira - ${row.job_count} new job${row.job_count === 1 ? "" : "s"} in your field this week`

  const items = jobs
    .map((job) => {
      const href = `${SITE_URL}/job/${job.id}?${utm}`
      const meta = [budget(job), LOCATION[job.location_type ?? ""]].filter(Boolean).join(" · ")
      return `<tr><td style="padding:14px 0;border-bottom:1px solid #e2e8f0;">
        <a href="${escapeHtml(href)}" style="color:#1B2B4B;font-size:16px;font-weight:600;text-decoration:none;">${escapeHtml(job.title)}</a>
        <div style="color:#64748b;font-size:14px;margin-top:4px;">${escapeHtml(meta)}</div>
      </td></tr>`
    })
    .join("")

  const more = row.job_count > jobs.length ? `<p style="margin:16px 0 0;color:#475569;font-size:14px;">და კიდევ ${row.job_count - jobs.length} სხვა.</p>` : ""

  const html = `<!DOCTYPE html>
<html lang="ka">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;">
    <div style="background:#0088FF;padding:18px 24px;">
      <span style="color:#F7CE50;font-size:22px;font-weight:700;">ჰირა</span>
    </div>
    <div style="padding:28px 24px;color:#1B2B4B;line-height:1.55;">
      <p style="font-size:16px;margin:0 0 8px;">გამარჯობა${firstName ? `, ${escapeHtml(firstName)}` : ""}!</p>
      <p style="font-size:15px;margin:0 0 12px;">ამ კვირაში ჰირაზე ${escapeHtml(jobCountPhrase(row.job_count))} გამოქვეყნდა, რომელიც შენს უნარებს ემთხვევა:</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table>
      ${more}
      <a href="${SITE_URL}/jobs?${utm}" style="display:inline-block;margin-top:22px;background:#0088FF;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:15px;">ყველა სამუშაოს ნახვა</a>
    </div>
    <div style="padding:16px 24px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;line-height:1.5;">
      ამ წერილს იღებ, რადგან ჰირაზე ფრილანსერის პროფილი გაქვს.
      <a href="${escapeHtml(unsubscribeUrl)}" style="color:#64748b;">გამოწერის გაუქმება</a>
    </div>
  </div>
</body>
</html>`

  const text = [
    `გამარჯობა${firstName ? `, ${firstName}` : ""}!`,
    `ამ კვირაში ჰირაზე ${jobCountPhrase(row.job_count)} გამოქვეყნდა შენს სფეროში:`,
    "",
    ...jobs.map((job) => `• ${job.title} — ${budget(job)}\n  ${SITE_URL}/job/${job.id}`),
    "",
    `ყველა სამუშაო: ${SITE_URL}/jobs`,
    `გამოწერის გაუქმება: ${unsubscribeUrl}`,
  ].join("\n")

  return { subject, asciiSubject, html, text }
}

serveWithSentry(FUNCTION_NAME, async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401)
  if (!mailConfigured()) return json({ error: "Email not configured" }, 503)
  if (!unsubscribeSecret()) return json({ error: "Unsubscribe secret not configured" }, 503)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? ""
  if (!supabaseUrl || !serviceRole) return json({ error: "Server misconfigured" }, 500)

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const functionsBase = `${supabaseUrl.replace(/\/$/, "")}/functions/v1`

  const started = Date.now()
  let claimed = 0
  let sent = 0
  let skipped = 0
  let failed = 0

  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data, error } = await admin.rpc("claim_weekly_digest_batch", { p_limit: BATCH_SIZE })
    if (error) {
      logStructured("error", FUNCTION_NAME, "claim_failed", { error: error.message })
      return json({ error: "Claim failed", claimed, sent, skipped, failed }, 500)
    }
    const rows = (data ?? []) as DigestRow[]
    if (rows.length === 0) break
    claimed += rows.length

    for (const row of rows) {
      if (!row.email || row.job_count < 1 || !row.jobs?.length) {
        skipped++
        continue
      }
      const token = await unsubscribeToken(row.user_id)
      const unsubscribeUrl = `${SITE_URL}/unsubscribe?u=${row.user_id}&t=${token}`
      const oneClickUrl = `${functionsBase}/digest-unsubscribe?u=${row.user_id}&t=${token}`
      const email = buildEmail(row, unsubscribeUrl)
      const result = await sendMail({
        to: row.email,
        ...email,
        headers: {
          "List-Unsubscribe": `<${oneClickUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      })
      if (result.ok) {
        sent++
      } else {
        failed++
        logStructured("error", FUNCTION_NAME, "send_failed", { user_id: row.user_id, detail: result.detail })
      }
    }
  }

  logStructured("info", FUNCTION_NAME, "digest_run", { claimed, sent, skipped, failed, ms: Date.now() - started })
  return json({ ok: true, claimed, sent, skipped, failed })
})
