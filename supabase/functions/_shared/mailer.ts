/// <reference path="../esm-modules.d.ts" />
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

declare const Deno: {
  env: { get: (key: string) => string | undefined }
}

export type MailMessage = {
  to: string
  /** UTF-8 subject (Resend). */
  subject: string
  /** Gmail SMTP path: denomailer mangles non-ASCII subjects, so it gets this one. */
  asciiSubject: string
  html: string
  text?: string
  headers?: Record<string, string>
}

export type MailResult = { ok: true; transport: "resend" | "gmail_smtp" } | { ok: false; detail: string }

export function mailConfigured(): boolean {
  const resend = Deno.env.get("RESEND_API_KEY")?.trim()
  const gmailUser = Deno.env.get("GMAIL_SMTP_USER")?.trim()
  const gmailPassword = Deno.env.get("GMAIL_SMTP_APP_PASSWORD")?.trim()
  return Boolean(resend || (gmailUser && gmailPassword))
}

/** Same transports as send-notification-email: Resend when configured, else Gmail SMTP. */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? ""
  if (resendKey) {
    const from = Deno.env.get("RESEND_FROM")?.trim() || "Hira <onboarding@resend.dev>"
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.headers,
      }),
    })
    if (!res.ok) return { ok: false, detail: `resend ${res.status}: ${(await res.text()).slice(0, 300)}` }
    return { ok: true, transport: "resend" }
  }

  const gmailUser = Deno.env.get("GMAIL_SMTP_USER")?.trim() ?? ""
  const gmailPassword = Deno.env.get("GMAIL_SMTP_APP_PASSWORD")?.trim() ?? ""
  if (!gmailUser || !gmailPassword) return { ok: false, detail: "email_not_configured" }

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: gmailUser, password: gmailPassword },
    },
  })
  try {
    await client.send({
      from: Deno.env.get("GMAIL_SMTP_FROM")?.trim() || `Hira <${gmailUser}>`,
      to: message.to,
      subject: message.asciiSubject,
      html: message.html,
      content: message.text ?? "auto",
    })
    return { ok: true, transport: "gmail_smtp" }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  } finally {
    try {
      await client.close()
    } catch {
      /* ignore */
    }
  }
}

/** HMAC-SHA256 hex — signs unsubscribe links so they can't be forged for other users. */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Secret for unsubscribe tokens; falls back to the webhook secret so no extra setup is required. */
export function unsubscribeSecret(): string {
  return (
    Deno.env.get("DIGEST_UNSUBSCRIBE_SECRET")?.trim() ||
    Deno.env.get("EMAIL_WEBHOOK_SECRET")?.trim() ||
    ""
  )
}

export function unsubscribeToken(userId: string): Promise<string> {
  return hmacHex(unsubscribeSecret(), `digest-unsubscribe:${userId}`)
}

/** Constant-time comparison for hex tokens. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
