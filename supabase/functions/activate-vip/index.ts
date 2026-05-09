// @ts-ignore -- Deno edge functions support URL imports; TS language service in this workspace does not resolve them.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

declare const Deno: {
  env: { get: (key: string) => string | undefined }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

async function paypalAccessToken(apiBase: string, clientId: string, secret: string): Promise<string> {
  const auth = btoa(`${clientId}:${secret}`)
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  })
  if (!res.ok) {
    const t = await res.text()
    console.error("[activate-vip] PayPal token error", res.status, t)
    throw new Error("PayPal authentication failed")
  }
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error("PayPal token missing")
  return data.access_token
}

async function paypalGetOrder(apiBase: string, accessToken: string, orderId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  })
  const body = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    console.error("[activate-vip] PayPal get order", res.status, body)
    throw new Error("PayPal order lookup failed")
  }
  return body
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID") ?? ""
  const paypalSecret = Deno.env.get("PAYPAL_SECRET") ?? ""
  const paypalApiBase = (Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com").replace(/\/$/, "")

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.error("[activate-vip] Missing Supabase env")
    return jsonResponse({ ok: false, error: "Server misconfiguration" }, 500)
  }
  if (!paypalClientId || !paypalSecret) {
    console.error("[activate-vip] Missing PayPal env")
    return jsonResponse({ ok: false, error: "PayPal not configured" }, 500)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401)
  }

  let bodyJson: { order_id?: string; job_id?: string; tier?: string; listing_type?: string }
  try {
    bodyJson = (await req.json()) as { order_id?: string; job_id?: string; tier?: string; listing_type?: string }
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const orderId = typeof bodyJson.order_id === "string" ? bodyJson.order_id.trim() : ""
  const listingId = typeof bodyJson.job_id === "string" ? bodyJson.job_id.trim() : ""
  const tierRaw = typeof bodyJson.tier === "string" ? bodyJson.tier.trim().toLowerCase() : ""
  const listingType = typeof bodyJson.listing_type === "string" ? bodyJson.listing_type.trim().toLowerCase() : "job"

  if (!orderId || !listingId || !tierRaw) {
    return jsonResponse({ ok: false, error: "order_id, job_id, and tier are required" }, 400)
  }

  if (!(tierRaw in VIP_TIERS)) {
    return jsonResponse({ ok: false, error: "Invalid tier" }, 400)
  }
  const tier = tierRaw as Tier
  const tierCfg = VIP_TIERS[tier]

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser()
  if (userErr || !user) {
    console.error("[activate-vip] auth.getUser", userErr)
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: existingPay, error: dupErr } = await admin
    .from("vip_payments")
    .select("id, listing_id")
    .eq("paypal_order_id", orderId)
    .maybeSingle()
  if (dupErr) {
    console.error("[activate-vip] duplicate check", dupErr)
    return jsonResponse({ ok: false, error: "Database error" }, 500)
  }
  if (existingPay && String((existingPay as { listing_id?: string }).listing_id) === listingId) {
    return jsonResponse({ ok: true, message: "Already processed" })
  }
  if (existingPay) {
    return jsonResponse({ ok: false, error: "Order already used" }, 400)
  }

  let prevExpiresRaw: string | null = null
  if (listingType === "freelancer") {
    const { data: serviceRow, error: serviceErr } = await admin
      .from("services")
      .select("id, freelancer_profile_id")
      .eq("id", listingId)
      .maybeSingle()
    if (serviceErr || !serviceRow) {
      console.error("[activate-vip] service load", serviceErr)
      return jsonResponse({ ok: false, error: "Listing not found" }, 404)
    }

    const freelancerProfileId = String((serviceRow as { freelancer_profile_id?: string }).freelancer_profile_id ?? "")
    const { data: freelancerRow, error: freelancerErr } = await admin
      .from("freelancer_profiles")
      .select("id, user_id")
      .eq("id", freelancerProfileId)
      .maybeSingle()
    if (freelancerErr || !freelancerRow) {
      console.error("[activate-vip] freelancer profile load", freelancerErr)
      return jsonResponse({ ok: false, error: "Freelancer profile not found" }, 404)
    }
    if (String((freelancerRow as { user_id?: string }).user_id ?? "") !== user.id) {
      console.error("[activate-vip] ownership", { listingType, listingId, userId: user.id })
      return jsonResponse({ ok: false, error: "Forbidden" }, 403)
    }

    const { data: priorVipPayments, error: priorVipErr } = await admin
      .from("vip_payments")
      .select("completed_at, vip_days")
      .eq("listing_id", listingId)
      .eq("status", "completed")
    if (priorVipErr) {
      console.error("[activate-vip] prior vip load", priorVipErr)
      return jsonResponse({ ok: false, error: "Database error" }, 500)
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
      console.error("[activate-vip] job load", jobErr)
      return jsonResponse({ ok: false, error: "Job not found" }, 404)
    }

    const hirerProfileId = String((jobRow as { hirer_profile_id?: string }).hirer_profile_id ?? "")
    const { data: hp, error: hpErr } = await admin
      .from("hirer_profiles")
      .select("user_id")
      .eq("id", hirerProfileId)
      .maybeSingle()
    if (hpErr || !hp?.user_id || String(hp.user_id) !== user.id) {
      console.error("[activate-vip] ownership", hpErr, hp)
      return jsonResponse({ ok: false, error: "Forbidden" }, 403)
    }
    prevExpiresRaw = (jobRow as { vip_expires_at?: string | null }).vip_expires_at ?? null
  }

  let accessToken: string
  try {
    accessToken = await paypalAccessToken(paypalApiBase, paypalClientId, paypalSecret)
  } catch (e) {
    console.error(e)
    return jsonResponse({ ok: false, error: "PayPal authentication failed" }, 502)
  }

  let order: Record<string, unknown>
  try {
    order = await paypalGetOrder(paypalApiBase, accessToken, orderId)
  } catch (e) {
    console.error(e)
    return jsonResponse({ ok: false, error: "Could not verify PayPal order" }, 502)
  }

  if (String(order.status) !== "COMPLETED") {
    console.error("[activate-vip] order not completed", order.status)
    return jsonResponse({ ok: false, error: "Payment not completed" }, 400)
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
    console.error("[activate-vip] amount mismatch", paidValue, tierCfg.price)
    return jsonResponse({ ok: false, error: "Amount mismatch" }, 400)
  }
  if (paidCurrency !== tierCfg.currency.toUpperCase()) {
    console.error("[activate-vip] currency mismatch", paidCurrency)
    return jsonResponse({ ok: false, error: "Currency mismatch" }, 400)
  }

  const now = new Date()
  let base = now.getTime()
  if (prevExpiresRaw) {
    const prev = new Date(prevExpiresRaw).getTime()
    if (Number.isFinite(prev) && prev > base) base = prev
  }
  const expiresAt = new Date(base + tierCfg.days * 24 * 60 * 60 * 1000).toISOString()

  const vipPaymentInsert: {
    job_id?: string
    listing_id: string
    user_id: string
    vip_tier: string
    vip_days: number
    paypal_order_id: string
    amount: number
    currency: string
    status: string
    completed_at: string
  } = {
    listing_id: listingId,
    user_id: user.id,
    vip_tier: tier,
    vip_days: tierCfg.days,
    paypal_order_id: orderId,
    amount: tierCfg.price,
    currency: tierCfg.currency,
    status: "completed",
    completed_at: now.toISOString(),
  }
  if (listingType === "job") {
    vipPaymentInsert.job_id = listingId
  }

  const { error: payInsErr } = await admin.from("vip_payments").insert(vipPaymentInsert)
  if (payInsErr) {
    console.error("[activate-vip] vip_payments insert", payInsErr)
    if (String(payInsErr.code) === "23505") {
      return jsonResponse({ ok: true, message: "Already processed" })
    }
    return jsonResponse({ ok: false, error: "Could not record payment" }, 500)
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
      console.error("[activate-vip] listing update", updErr)
      return jsonResponse({ ok: false, error: "Could not activate VIP" }, 500)
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
      console.error("[activate-vip] service VIP update", svcErr)
      return jsonResponse({ ok: false, error: "Could not activate VIP" }, 500)
    }
  }

  return jsonResponse({ ok: true, vip_expires_at: expiresAt, tier, listing_type: listingType })
})
