// @ts-ignore -- Deno edge functions support URL imports; TS language service in this workspace does not resolve them.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { enforceRateLimit } from "../_shared/rateLimit.ts"
import { corsHeadersFor } from "../_shared/cors.ts"
import { requestLog } from "../_shared/structuredLog.ts"
import { serveWithSentry } from "../_shared/sentry.ts"

declare const Deno: {
  env: { get: (key: string) => string | undefined }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

/**
 * Listed prices are ₾10 / ₾20 / ₾30 on the client. PayPal captures USD — must match `vipTierPayPalUsd` in
 * `src/lib/vipJobTiers.ts` (GEL ÷ GEL_PER_USD_FOR_PAYPAL, currently 2.75).
 */
const VIP_TIERS = {
  bronze: { price: 3.64, days: 7, currency: "USD" },
  silver: { price: 7.27, days: 14, currency: "USD" },
  gold: { price: 10.91, days: 30, currency: "USD" },
} as const

type Tier = keyof typeof VIP_TIERS

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  })
}

async function paypalAccessToken(
  req: Request,
  apiBase: string,
  clientId: string,
  secret: string,
): Promise<string> {
  const log = requestLog(req)
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  })
  if (!res.ok) {
    const t = await res.text()
    log?.event("paypal_token_failed", { http_status: res.status, detail: t.slice(0, 500) }, "error")
    throw new Error("PayPal authentication failed")
  }
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) {
    log?.event("paypal_token_missing", {}, "error")
    throw new Error("PayPal token missing")
  }
  log?.event("paypal_token_ok", {})
  return data.access_token
}

async function paypalGetOrder(
  req: Request,
  apiBase: string,
  accessToken: string,
  orderId: string,
): Promise<Record<string, unknown>> {
  const log = requestLog(req)
  log?.event("paypal_order_verify_start", { order_id: orderId })
  const res = await fetch(`${apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  })
  const body = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    log?.event(
      "paypal_order_verify_failed",
      { order_id: orderId, http_status: res.status, paypal_status: body.status ?? null },
      "error",
    )
    throw new Error("PayPal order lookup failed")
  }
  log?.event("paypal_order_verify_ok", {
    order_id: orderId,
    paypal_status: body.status ?? null,
  })
  return body
}

serveWithSentry("activate-vip", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeadersFor(req) })
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID") ?? ""
  const paypalSecret = Deno.env.get("PAYPAL_SECRET") ?? ""
  const paypalApiBase = (Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com").replace(/\/$/, "")

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse(req, { ok: false, error: "Server misconfiguration" }, 500)
  }
  if (!paypalClientId || !paypalSecret) {
    return jsonResponse(req, { ok: false, error: "PayPal not configured" }, 500)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(req, { ok: false, error: "Unauthorized" }, 401)
  }

  let bodyJson: { order_id?: string; job_id?: string; tier?: string; listing_type?: string }
  try {
    bodyJson = (await req.json()) as { order_id?: string; job_id?: string; tier?: string; listing_type?: string }
  } catch {
    return jsonResponse(req, { ok: false, error: "Invalid JSON body" }, 400)
  }

  const orderId = typeof bodyJson.order_id === "string" ? bodyJson.order_id.trim() : ""
  const listingId = typeof bodyJson.job_id === "string" ? bodyJson.job_id.trim() : ""
  const tierRaw = typeof bodyJson.tier === "string" ? bodyJson.tier.trim().toLowerCase() : ""
  const listingType = typeof bodyJson.listing_type === "string" ? bodyJson.listing_type.trim().toLowerCase() : "job"

  if (!orderId || !listingId || !tierRaw) {
    return jsonResponse(req, { ok: false, error: "order_id, job_id, and tier are required" }, 400)
  }

  if (!(tierRaw in VIP_TIERS)) {
    return jsonResponse(req, { ok: false, error: "Invalid tier" }, 400)
  }
  const tier = tierRaw as Tier
  const tierCfg = VIP_TIERS[tier]

  requestLog(req)?.set({
    order_id: orderId,
    listing_id: listingId,
    listing_type: listingType,
    tier,
  })

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser()
  if (userErr || !user) {
    return jsonResponse(req, { ok: false, error: "Unauthorized" }, 401)
  }

  requestLog(req)?.set({ user_id: user.id })

  const rateLimited = await enforceRateLimit(
    req,
    { prefix: "rl:activate-vip", requests: 10, window: "1 m", key: user.id },
    corsHeadersFor(req),
  )
  if (rateLimited) return rateLimited

  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: existingPay, error: dupErr } = await admin
    .from("vip_payments")
    .select("id, listing_id")
    .eq("paypal_order_id", orderId)
    .maybeSingle()
  if (dupErr) {
    return jsonResponse(req, { ok: false, error: "Database error" }, 500)
  }
  if (existingPay && String((existingPay as { listing_id?: string }).listing_id) === listingId) {
    requestLog(req)?.event("paypal_order_verify_skipped", { reason: "already_processed" })
    return jsonResponse(req, { ok: true, message: "Already processed" })
  }
  if (existingPay) {
    requestLog(req)?.event("paypal_order_verify_rejected", { reason: "order_already_used" }, "warn")
    return jsonResponse(req, { ok: false, error: "Order already used" }, 400)
  }

  let prevExpiresRaw: string | null = null
  if (listingType === "freelancer") {
    const { data: serviceRow, error: serviceErr } = await admin
      .from("services")
      .select("id, freelancer_profile_id")
      .eq("id", listingId)
      .maybeSingle()
    if (serviceErr || !serviceRow) {
      return jsonResponse(req, { ok: false, error: "Listing not found" }, 404)
    }

    const freelancerProfileId = String((serviceRow as { freelancer_profile_id?: string }).freelancer_profile_id ?? "")
    const { data: freelancerRow, error: freelancerErr } = await admin
      .from("freelancer_profiles")
      .select("id, user_id")
      .eq("id", freelancerProfileId)
      .maybeSingle()
    if (freelancerErr || !freelancerRow) {
      return jsonResponse(req, { ok: false, error: "Freelancer profile not found" }, 404)
    }
    if (String((freelancerRow as { user_id?: string }).user_id ?? "") !== user.id) {
      return jsonResponse(req, { ok: false, error: "Forbidden" }, 403)
    }

    const { data: priorVipPayments, error: priorVipErr } = await admin
      .from("vip_payments")
      .select("completed_at, vip_days")
      .eq("listing_id", listingId)
      .eq("status", "completed")
    if (priorVipErr) {
      return jsonResponse(req, { ok: false, error: "Database error" }, 500)
    }
    let maxExpiresAtMs = 0
    for (const row of priorVipPayments ?? []) {
      const completedAtRaw = String((row as { completed_at?: string | null }).completed_at ?? "")
      const vipDaysRaw = Number((row as { vip_days?: number | null }).vip_days ?? 0)
      const completedAtMs = new Date(completedAtRaw).getTime()
      if (!Number.isFinite(completedAtMs) || !Number.isFinite(vipDaysRaw) || vipDaysRaw <= 0) continue
      const rowExpiresMs = completedAtMs + vipDaysRaw * 24 * 60 * 60 * 1000
      if (rowExpiresMs > maxExpiresAtMs) maxExpiresAtMs = rowExpiresMs
    }
    if (maxExpiresAtMs > 0) {
      prevExpiresRaw = new Date(maxExpiresAtMs).toISOString()
    }
  } else {
    const { data: jobRow, error: jobErr } = await admin
      .from("jobs")
      .select("id, hirer_profile_id, vip_expires_at")
      .eq("id", listingId)
      .maybeSingle()
    if (jobErr || !jobRow) {
      return jsonResponse(req, { ok: false, error: "Job not found" }, 404)
    }

    const hirerProfileId = String((jobRow as { hirer_profile_id?: string }).hirer_profile_id ?? "")
    const { data: hp, error: hpErr } = await admin
      .from("hirer_profiles")
      .select("user_id")
      .eq("id", hirerProfileId)
      .maybeSingle()
    if (hpErr || !hp?.user_id || String(hp.user_id) !== user.id) {
      return jsonResponse(req, { ok: false, error: "Forbidden" }, 403)
    }
    prevExpiresRaw = (jobRow as { vip_expires_at?: string | null }).vip_expires_at ?? null
  }

  let accessToken: string
  try {
    accessToken = await paypalAccessToken(req, paypalApiBase, paypalClientId, paypalSecret)
  } catch {
    return jsonResponse(req, { ok: false, error: "PayPal authentication failed" }, 502)
  }

  let order: Record<string, unknown>
  try {
    order = await paypalGetOrder(req, paypalApiBase, accessToken, orderId)
  } catch {
    return jsonResponse(req, { ok: false, error: "Could not verify PayPal order" }, 502)
  }

  if (String(order.status) !== "COMPLETED") {
    requestLog(req)?.event(
      "paypal_order_verify_rejected",
      { order_id: orderId, paypal_status: order.status ?? null, reason: "not_completed" },
      "warn",
    )
    return jsonResponse(req, { ok: false, error: "Payment not completed" }, 400)
  }

  const purchaseUnits = order.purchase_units as unknown
  const firstUnit = Array.isArray(purchaseUnits) ? purchaseUnits[0] : null
  const payments = firstUnit && typeof firstUnit === "object" && firstUnit !== null && "payments" in firstUnit
    ? (firstUnit as { payments?: { captures?: unknown[] } }).payments
    : undefined
  const captures = payments?.captures
  const capture0 = Array.isArray(captures) && captures.length > 0 ? (captures[0] as Record<string, unknown>) : null
  const amountObj = capture0?.amount as { value?: string; currency_code?: string } | undefined
  const paidValue = amountObj?.value != null ? Number.parseFloat(String(amountObj.value)) : NaN
  const paidCurrency = amountObj?.currency_code != null ? String(amountObj.currency_code).toUpperCase() : ""

  if (!Number.isFinite(paidValue) || Math.abs(paidValue - tierCfg.price) > 0.02) {
    requestLog(req)?.event(
      "paypal_order_verify_rejected",
      {
        order_id: orderId,
        reason: "amount_mismatch",
        paid_value: paidValue,
        expected_value: tierCfg.price,
      },
      "warn",
    )
    return jsonResponse(req, { ok: false, error: "Amount mismatch" }, 400)
  }
  if (paidCurrency !== tierCfg.currency.toUpperCase()) {
    requestLog(req)?.event(
      "paypal_order_verify_rejected",
      { order_id: orderId, reason: "currency_mismatch", paid_currency: paidCurrency },
      "warn",
    )
    return jsonResponse(req, { ok: false, error: "Currency mismatch" }, 400)
  }

  requestLog(req)?.event("paypal_order_verify_accepted", {
    order_id: orderId,
    paid_value: paidValue,
    paid_currency: paidCurrency,
  })

  const now = new Date()
  let base = now.getTime()
  if (prevExpiresRaw) {
    const prev = new Date(prevExpiresRaw).getTime()
    if (Number.isFinite(prev) && prev > base) base = prev
  }
  const expiresAt = new Date(base + tierCfg.days * 24 * 60 * 60 * 1000).toISOString()

  const vipPaymentInsert: {
    listing_id: string
    user_id: string
    tier: string
    vip_days: number
    paypal_order_id: string
    amount: number
    currency: string
    status: string
    completed_at: string
  } = {
    listing_id: listingId,
    user_id: user.id,
    tier,
    vip_days: tierCfg.days,
    paypal_order_id: orderId,
    amount: tierCfg.price,
    currency: tierCfg.currency,
    status: "completed",
    completed_at: now.toISOString(),
  }

  const { error: payInsErr } = await admin.from("vip_payments").insert(vipPaymentInsert)
  if (payInsErr) {
    if (String(payInsErr.code) === "23505") {
      return jsonResponse(req, { ok: true, message: "Already processed" })
    }
    return jsonResponse(req, { ok: false, error: "Could not record payment" }, 500)
  }

  if (listingType === "job") {
    const { error: updErr } = await admin
      .from("jobs")
      .update({
        is_vip: true,
        vip_tier: tier,
        vip_expires_at: expiresAt,
        updated_at: now.toISOString(),
      })
      .eq("id", listingId)
    if (updErr) {
      return jsonResponse(req, { ok: false, error: "Could not activate VIP" }, 500)
    }
  } else if (listingType === "freelancer") {
    const { error: svcErr } = await admin
      .from("services")
      .update({
        is_vip: true,
        vip_expires_at: expiresAt,
        updated_at: now.toISOString(),
      })
      .eq("id", listingId)
    if (svcErr) {
      return jsonResponse(req, { ok: false, error: "Could not activate VIP" }, 500)
    }
  }

  return jsonResponse(req, { ok: true, vip_expires_at: expiresAt, tier, listing_type: listingType })
})
