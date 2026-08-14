import { getRedis } from "./rateLimit.ts"

declare const Deno: {
  env: { get: (key: string) => string | undefined }
}

export type AlertKind = "edge_5xx" | "notify_email_failure"

type AlertConfig = {
  counterKey: string
  threshold: number
  windowMs: number
  title: string
}

function envInt(name: string, fallback: number): number {
  const raw = Deno.env.get(name)?.trim()
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function envMinutes(name: string, fallbackMinutes: number): number {
  return envInt(name, fallbackMinutes) * 60 * 1000
}

function alertConfig(kind: AlertKind): AlertConfig {
  if (kind === "notify_email_failure") {
    return {
      counterKey: "alert:notify_email:failures",
      threshold: envInt("ALERT_NOTIFY_EMAIL_FAIL_THRESHOLD", 5),
      windowMs: envMinutes("ALERT_NOTIFY_EMAIL_WINDOW_MINUTES", 5),
      title: "notify_via_email failures exceeded threshold",
    }
  }
  return {
    counterKey: "alert:edge:5xx",
    threshold: envInt("ALERT_EDGE_5XX_THRESHOLD", 10),
    windowMs: envMinutes("ALERT_EDGE_5XX_WINDOW_MINUTES", 5),
    title: "Edge Function 5xx rate exceeded threshold",
  }
}

function cooldownMs(): number {
  return envMinutes("ALERT_COOLDOWN_MINUTES", 15)
}

function webhookFormat(url: string): "slack" | "discord" {
  const override = Deno.env.get("ALERT_WEBHOOK_FORMAT")?.trim().toLowerCase()
  if (override === "slack" || override === "discord") return override
  if (url.includes("discord.com/api/webhooks")) return "discord"
  return "slack"
}

async function slidingWindowIncrement(redis: NonNullable<ReturnType<typeof getRedis>>, key: string, windowMs: number): Promise<number> {
  const now = Date.now()
  const member = `${now}:${crypto.randomUUID()}`
  const windowStart = now - windowMs
  await redis.zadd(key, { score: now, member })
  await redis.zremrangebyscore(key, 0, windowStart)
  await redis.expire(key, Math.ceil(windowMs / 1000) + 120)
  return await redis.zcard(key)
}

async function sendWebhook(url: string, text: string): Promise<void> {
  const format = webhookFormat(url)
  const body =
    format === "discord"
      ? JSON.stringify({ content: text })
      : JSON.stringify({ text })

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        function: "alerting",
        message: "alert_webhook_failed",
        status: res.status,
        detail: detail.slice(0, 500),
      }),
    )
  }
}

async function maybeFireAlert(kind: AlertKind, count: number, detail: Record<string, unknown>): Promise<void> {
  const webhookUrl = Deno.env.get("ALERT_WEBHOOK_URL")?.trim()
  if (!webhookUrl) return

  const config = alertConfig(kind)
  if (count < config.threshold) return

  const redis = getRedis()
  if (!redis) return

  const cooldownKey = `alert:cooldown:${kind}`
  try {
    const cooling = await redis.get(cooldownKey)
    if (cooling) return

    const text = [
      `[Gigori] ${config.title}`,
      `count=${count} threshold=${config.threshold} window_ms=${config.windowMs}`,
      JSON.stringify(detail),
    ].join("\n")

    await sendWebhook(webhookUrl, text)
    await redis.set(cooldownKey, "1", { px: cooldownMs() })
  } catch (e) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        function: "alerting",
        message: "alert_dispatch_failed",
        alert_kind: kind,
        error: e instanceof Error ? e.message : String(e),
      }),
    )
  }
}

async function recordAlertEvent(kind: AlertKind, detail: Record<string, unknown>): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  const config = alertConfig(kind)
  try {
    const count = await slidingWindowIncrement(redis, config.counterKey, config.windowMs)
    await maybeFireAlert(kind, count, detail)
  } catch (e) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        function: "alerting",
        message: "alert_counter_failed",
        alert_kind: kind,
        error: e instanceof Error ? e.message : String(e),
      }),
    )
  }
}

/** Increment 5xx counter and maybe notify via ALERT_WEBHOOK_URL. */
export async function recordEdge5xx(functionName: string, status: number, requestId?: string): Promise<void> {
  await recordAlertEvent("edge_5xx", {
    function: functionName,
    status,
    request_id: requestId ?? null,
  })
}

/** Increment notify_via_email failure counter and maybe notify via ALERT_WEBHOOK_URL. */
export async function recordNotifyEmailFailure(detail: Record<string, unknown>): Promise<void> {
  await recordAlertEvent("notify_email_failure", detail)
}
