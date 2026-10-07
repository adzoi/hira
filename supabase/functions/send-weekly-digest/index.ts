/// <reference path="../esm-modules.d.ts" />
// Weekly email. Freelancers: new jobs in their field + who viewed their profile and how often their
// listings were seen. Hirers: views and applicants on their open jobs. Triggered by pg_cron
// (public.trigger_weekly_digest) with the shared webhook secret; can also be run manually with the
// service-role key.
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

type FreelancerActivity = {
  profile_views: number
  profile_views_prev: number
  search_impressions: number
  hirer_viewer_count: number
  hirer_viewers: string[] | null
  listings: Array<{ id: string; title: string; views: number }> | null
}

type HirerActivity = {
  profile_views: number
  jobs: Array<{
    id: string
    title: string
    views: number
    new_applicants: number
    pending_applicants: number
    total_applicants: number
  }> | null
}

type DigestRow = {
  user_id: string
  email: string
  full_name: string | null
  user_type: "freelancer" | "hirer"
  job_count: number
  jobs: DigestJob[] | null
  activity: FreelancerActivity | HirerActivity | null
}

type Email = { subject: string; asciiSubject: string; html: string; text: string }

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

const UTM = "utm_source=digest&utm_medium=email&utm_campaign=weekly"

function times(n: number): string {
  return `${n.toLocaleString("en-US").replace(/,/g, " ")}-ჯერ`
}

function shell(firstName: string, bodyHtml: string, footerReason: string, unsubscribeUrl: string): string {
  return `<!DOCTYPE html>
<html lang="ka">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;">
    <div style="background:#0088FF;padding:18px 24px;">
      <span style="color:#F7CE50;font-size:22px;font-weight:700;">ჰირა</span>
    </div>
    <div style="padding:28px 24px;color:#1B2B4B;line-height:1.55;">
      <p style="font-size:16px;margin:0 0 8px;">გამარჯობა${firstName ? `, ${escapeHtml(firstName)}` : ""}!</p>
      ${bodyHtml}
    </div>
    <div style="padding:16px 24px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;line-height:1.5;">
      ${escapeHtml(footerReason)}
      <a href="${escapeHtml(unsubscribeUrl)}" style="color:#64748b;">გამოწერის გაუქმება</a>
    </div>
  </div>
</body>
</html>`
}

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin-top:18px;background:#0088FF;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:15px;">${escapeHtml(label)}</a>`
}

function statBox(value: string, label: string): string {
  return `<td style="padding:12px;background:#E8F4FF;border-radius:10px;text-align:center;width:50%;">
    <div style="font-size:24px;font-weight:700;color:#1B2B4B;">${escapeHtml(value)}</div>
    <div style="font-size:13px;color:#475569;margin-top:2px;">${escapeHtml(label)}</div>
  </td>`
}

function trendPhrase(now: number, prev: number): string {
  if (prev <= 0 || now === prev) return ""
  const pct = Math.round(((now - prev) / prev) * 100)
  return pct > 0 ? ` (+${pct}% წინა კვირასთან)` : ` (${pct}% წინა კვირასთან)`
}

function hasFreelancerActivity(a: FreelancerActivity | null): a is FreelancerActivity {
  if (!a) return false
  return a.profile_views > 0 || a.search_impressions > 0 || (a.listings?.length ?? 0) > 0
}

function hasHirerActivity(a: HirerActivity | null): a is HirerActivity {
  if (!a?.jobs?.length) return false
  return a.jobs.some((j) => j.views > 0 || j.new_applicants > 0 || j.pending_applicants > 0)
}

function buildFreelancerEmail(row: DigestRow, unsubscribeUrl: string): Email | null {
  const firstName = (row.full_name ?? "").trim().split(/\s+/)[0] ?? ""
  const jobs = row.jobs ?? []
  const activity = hasFreelancerActivity(row.activity as FreelancerActivity | null) ? (row.activity as FreelancerActivity) : null
  if (row.job_count < 1 && !activity) return null

  const parts: string[] = []
  const textParts: string[] = []

  if (activity) {
    const viewers = (activity.hirer_viewers ?? []).filter(Boolean)
    const viewerLine =
      activity.hirer_viewer_count > 0
        ? viewers.length > 0
          ? `შენი პროფილი ნახეს: <strong>${viewers.map(escapeHtml).join(", ")}</strong>${
              activity.hirer_viewer_count > viewers.length ? ` და კიდევ ${activity.hirer_viewer_count - viewers.length} დამქირავებელმა` : ""
            }.`
          : `${activity.hirer_viewer_count} დამქირავებელმა ნახა შენი პროფილი.`
        : ""
    const listings = (activity.listings ?? [])
      .map(
        (l) =>
          `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;"><a href="${escapeHtml(`${SITE_URL}/listing/${l.id}?${UTM}`)}" style="color:#1B2B4B;text-decoration:none;font-weight:600;">${escapeHtml(l.title)}</a>
          <span style="color:#64748b;font-size:14px;"> - ნახეს ${escapeHtml(times(l.views))}</span></td></tr>`,
      )
      .join("")

    parts.push(`<p style="font-size:15px;margin:0 0 14px;">შენი კვირა ჰირაზე:</p>
      <table role="presentation" width="100%" cellspacing="8" cellpadding="0" style="margin:0 -8px;"><tr>
        ${statBox(String(activity.profile_views), "პროფილის ნახვა")}
        ${statBox(String(activity.search_impressions), "ძიებაში გამოჩენა")}
      </tr></table>
      ${trendPhrase(activity.profile_views, activity.profile_views_prev) ? `<p style="font-size:13px;color:#475569;margin:8px 0 0;">პროფილის ნახვები${escapeHtml(trendPhrase(activity.profile_views, activity.profile_views_prev))}</p>` : ""}
      ${viewerLine ? `<p style="font-size:15px;margin:16px 0 0;">${viewerLine}</p>` : ""}
      ${listings ? `<p style="font-size:15px;margin:18px 0 4px;font-weight:600;">შენი განცხადებები</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${listings}</table>` : ""}
      ${button(`${SITE_URL}/dashboard/stats?${UTM}`, "სრული სტატისტიკა")}`)

    textParts.push(
      `შენი პროფილი ამ კვირაში ${times(activity.profile_views)} ნახეს, ძიებაში ${times(activity.search_impressions)} გამოჩნდი.`,
      ...(viewers.length ? [`პროფილი ნახეს: ${viewers.join(", ")}`] : []),
      ...(activity.listings ?? []).map((l) => `• ${l.title} - ნახეს ${times(l.views)}`),
      `სტატისტიკა: ${SITE_URL}/dashboard/stats`,
      "",
    )
  }

  if (row.job_count > 0 && jobs.length > 0) {
    const items = jobs
      .map((job) => {
        const href = `${SITE_URL}/job/${job.id}?${UTM}`
        const meta = [budget(job), LOCATION[job.location_type ?? ""]].filter(Boolean).join(" · ")
        return `<tr><td style="padding:14px 0;border-bottom:1px solid #e2e8f0;">
        <a href="${escapeHtml(href)}" style="color:#1B2B4B;font-size:16px;font-weight:600;text-decoration:none;">${escapeHtml(job.title)}</a>
        <div style="color:#64748b;font-size:14px;margin-top:4px;">${escapeHtml(meta)}</div>
      </td></tr>`
      })
      .join("")
    const more = row.job_count > jobs.length ? `<p style="margin:16px 0 0;color:#475569;font-size:14px;">და კიდევ ${row.job_count - jobs.length} სხვა.</p>` : ""
    parts.push(`<p style="font-size:15px;margin:${activity ? "28px" : "0"} 0 12px;">ამ კვირაში ჰირაზე ${escapeHtml(jobCountPhrase(row.job_count))} გამოქვეყნდა, რომელიც შენს უნარებს ემთხვევა:</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table>
      ${more}
      ${button(`${SITE_URL}/jobs?${UTM}`, "ყველა სამუშაოს ნახვა")}`)
    textParts.push(
      `ამ კვირაში ჰირაზე ${jobCountPhrase(row.job_count)} გამოქვეყნდა შენს სფეროში:`,
      ...jobs.map((job) => `• ${job.title} - ${budget(job)}\n  ${SITE_URL}/job/${job.id}`),
      `ყველა სამუშაო: ${SITE_URL}/jobs`,
      "",
    )
  }

  const subject =
    row.job_count > 0
      ? `${jobCountPhrase(row.job_count)} შენს სფეროში ამ კვირაში`
      : `შენი პროფილი ამ კვირაში ${times(activity?.profile_views ?? 0)} ნახეს`
  const asciiSubject =
    row.job_count > 0
      ? `Hira - ${row.job_count} new job${row.job_count === 1 ? "" : "s"} in your field this week`
      : `Hira - your profile was viewed ${activity?.profile_views ?? 0} times this week`

  const html = shell(firstName, parts.join(""), "ამ წერილს იღებ, რადგან ჰირაზე ფრილანსერის პროფილი გაქვს.", unsubscribeUrl)
  const text = [`გამარჯობა${firstName ? `, ${firstName}` : ""}!`, "", ...textParts, `გამოწერის გაუქმება: ${unsubscribeUrl}`].join("\n")
  return { subject, asciiSubject, html, text }
}

function buildHirerEmail(row: DigestRow, unsubscribeUrl: string): Email | null {
  const activity = row.activity as HirerActivity | null
  if (!hasHirerActivity(activity)) return null
  const firstName = (row.full_name ?? "").trim().split(/\s+/)[0] ?? ""
  const jobs = activity.jobs ?? []
  const newApplicants = jobs.reduce((sum, j) => sum + j.new_applicants, 0)
  const pending = jobs.reduce((sum, j) => sum + j.pending_applicants, 0)
  const views = jobs.reduce((sum, j) => sum + j.views, 0)

  const rows = jobs
    .map((j) => {
      const bits = [`ნახვა: ${j.views}`]
      if (j.new_applicants > 0) bits.push(`${j.new_applicants} ახალი განმცხადებელი`)
      if (j.pending_applicants > 0) bits.push(`${j.pending_applicants} გელოდება პასუხს`)
      const nudge =
        j.total_applicants === 0
          ? `<div style="color:#b45309;font-size:13px;margin-top:4px;">ჯერ არავინ განაცხადა - სცადე ბიუჯეტის გაზრდა ან ფრილანსერების პირდაპირ მოწვევა.</div>`
          : ""
      return `<tr><td style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
        <a href="${escapeHtml(`${SITE_URL}/job/${j.id}?${UTM}`)}" style="color:#1B2B4B;font-size:16px;font-weight:600;text-decoration:none;">${escapeHtml(j.title)}</a>
        <div style="color:#64748b;font-size:14px;margin-top:4px;">${escapeHtml(bits.join(" · "))}</div>${nudge}
      </td></tr>`
    })
    .join("")

  const body = `<p style="font-size:15px;margin:0 0 14px;">შენი განცხადებები ამ კვირაში:</p>
    <table role="presentation" width="100%" cellspacing="8" cellpadding="0" style="margin:0 -8px;"><tr>
      ${statBox(String(views), "ნახვა")}
      ${statBox(String(newApplicants), "ახალი განმცხადებელი")}
    </tr></table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;">${rows}</table>
    ${pending > 0 ? button(`${SITE_URL}/dashboard?${UTM}`, `განმცხადებლების შედარება (${pending})`) : button(`${SITE_URL}/freelancers?${UTM}`, "ფრილანსერების მოძებნა")}`

  const subject =
    newApplicants > 0
      ? `${newApplicants} ახალი განმცხადებელი შენს განცხადებებზე`
      : `შენი განცხადებები ამ კვირაში ${times(views)} ნახეს`
  const asciiSubject =
    newApplicants > 0
      ? `Hira - ${newApplicants} new applicant${newApplicants === 1 ? "" : "s"} on your jobs`
      : `Hira - your jobs were viewed ${views} times this week`
  const html = shell(firstName, body, "ამ წერილს იღებ, რადგან ჰირაზე აქტიური განცხადება გაქვს.", unsubscribeUrl)
  const text = [
    `გამარჯობა${firstName ? `, ${firstName}` : ""}!`,
    "",
    `შენი განცხადებები ამ კვირაში: ${views} ნახვა, ${newApplicants} ახალი განმცხადებელი.`,
    ...jobs.map((j) => `• ${j.title} - ნახვა ${j.views}, ახალი ${j.new_applicants}, მოლოდინში ${j.pending_applicants}\n  ${SITE_URL}/job/${j.id}`),
    "",
    `დაფა: ${SITE_URL}/dashboard`,
    `გამოწერის გაუქმება: ${unsubscribeUrl}`,
  ].join("\n")
  return { subject, asciiSubject, html, text }
}

function buildEmail(row: DigestRow, unsubscribeUrl: string): Email | null {
  return row.user_type === "hirer" ? buildHirerEmail(row, unsubscribeUrl) : buildFreelancerEmail(row, unsubscribeUrl)
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
      if (!row.email) {
        skipped++
        continue
      }
      const token = await unsubscribeToken(row.user_id)
      const unsubscribeUrl = `${SITE_URL}/unsubscribe?u=${row.user_id}&t=${token}`
      const oneClickUrl = `${functionsBase}/digest-unsubscribe?u=${row.user_id}&t=${token}`
      // Nothing new this week (no matching jobs, no views): stay quiet.
      const email = buildEmail(row, unsubscribeUrl)
      if (!email) {
        skipped++
        continue
      }
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
