import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { enforceRateLimit } from "../_shared/rateLimit.ts"
import { corsHeadersFor } from "../_shared/cors.ts"
import { requestLog } from "../_shared/structuredLog.ts"
import { serveWithSentry } from "../_shared/sentry.ts"

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  })
}

function paypalClientSecret(): string {
  return (
    Deno.env.get("PAYPAL_SECRET")?.trim() ||
    Deno.env.get("PAYPAL_CLIENT_SECRET")?.trim() ||
    ""
  )
}

async function paypalAccessToken(req: Request, apiBase: string, clientId: string, secret: string): Promise<string> {
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
    requestLog(req)?.event("paypal_token_failed", { http_status: res.status, detail: t.slice(0, 500) }, "error")
    throw new Error("PayPal authentication failed")
  }
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error("PayPal token missing")
  return data.access_token
}

async function paypalGetOrder(
  req: Request,
  apiBase: string,
  accessToken: string,
  orderId: string,
): Promise<Record<string, unknown>> {
  requestLog(req)?.event("paypal_order_lookup_start", { order_id: orderId })
  const res = await fetch(`${apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  })
  const body = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    requestLog(req)?.event(
      "paypal_order_lookup_failed",
      { order_id: orderId, http_status: res.status, paypal_status: body.status ?? null },
      "error",
    )
    throw new Error("PayPal order lookup failed")
  }
  requestLog(req)?.event("paypal_order_lookup_ok", { order_id: orderId, paypal_status: body.status ?? null })
  return body
}

/**
 * Server-side order capture (avoids client-side "Buyer access token not present" on capture).
 * @see https://developer.paypal.com/docs/api/orders/v2/#orders_capture
 */
async function paypalCaptureOrder(
  req: Request,
  apiBase: string,
  accessToken: string,
  orderId: string,
): Promise<Record<string, unknown>> {
  requestLog(req)?.event("paypal_order_capture_start", { order_id: orderId })
  const res = await fetch(`${apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  })
  const body = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    requestLog(req)?.event(
      "paypal_order_capture_failed",
      { order_id: orderId, http_status: res.status, paypal_name: body.name ?? null },
      "error",
    )
    const msg =
      typeof body.message === "string"
        ? body.message
        : typeof body.name === "string"
          ? body.name
          : "PayPal capture failed"
    throw new Error(msg)
  }
  requestLog(req)?.event("paypal_order_capture_ok", { order_id: orderId, paypal_status: body.status ?? null })
  return body
}

async function verifyListingOwnership(
  admin: ReturnType<typeof createClient>,
  userId: string,
  listingId: string,
  listingType: string,
): Promise<boolean> {
  if (listingType === "freelancer") {
    const { data: serviceRow, error: serviceErr } = await admin
      .from("services")
      .select("id, freelancer_profile_id")
      .eq("id", listingId)
      .maybeSingle()
    if (serviceErr || !serviceRow) return false

    const freelancerProfileId = String(
      (serviceRow as { freelancer_profile_id?: string }).freelancer_profile_id ?? "",
    )
    const { data: freelancerRow, error: freelancerErr } = await admin
      .from("freelancer_profiles")
      .select("user_id")
      .eq("id", freelancerProfileId)
      .maybeSingle()
    if (freelancerErr || !freelancerRow) return false
    return String((freelancerRow as { user_id?: string }).user_id ?? "") === userId
  }

  const { data: jobRow, error: jobErr } = await admin
    .from("jobs")
    .select("id, hirer_profile_id")
    .eq("id", listingId)
    .maybeSingle()
  if (jobErr || !jobRow) return false

  const hirerProfileId = String((jobRow as { hirer_profile_id?: string }).hirer_profile_id ?? "")
  const { data: hp, error: hpErr } = await admin
    .from("hirer_profiles")
    .select("user_id")
    .eq("id", hirerProfileId)
    .maybeSingle()
  if (hpErr || !hp?.user_id) return false
  return String(hp.user_id) === userId
}

function orderReferenceId(order: Record<string, unknown>): string | null {
  const purchaseUnits = order.purchase_units as unknown
  const firstUnit = Array.isArray(purchaseUnits) ? purchaseUnits[0] : null
  if (!firstUnit || typeof firstUnit !== "object" || firstUnit === null) return null
  const ref = (firstUnit as { reference_id?: unknown }).reference_id
  return typeof ref === "string" && ref.trim() ? ref.trim() : null
}

serveWithSentry("paypal-capture", async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeadersFor(req) })
    }

    if (req.method !== "POST") {
      return jsonResponse(req, { error: "Method not allowed" }, 405)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? ""
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? ""
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse(req, { error: "Server misconfigured" }, 500)
    }

    const authHeader = req.headers.get("Authorization") ?? ""
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse(req, { error: "Unauthorized" }, 401)
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) {
      return jsonResponse(req, { error: "Unauthorized" }, 401)
    }

    requestLog(req)?.set({ user_id: user.id })

    const rateLimited = await enforceRateLimit(
      req,
      { prefix: "rl:paypal-capture", requests: 5, window: "1 m", key: user.id, failClosed: true },
      corsHeadersFor(req),
    )
    if (rateLimited) return rateLimited

    let payload: Record<string, unknown>
    try {
      payload = (await req.json()) as Record<string, unknown>
    } catch {
      return jsonResponse(req, { error: "Invalid JSON body" }, 400)
    }

    const orderID = typeof payload.orderID === "string" ? payload.orderID.trim() : ""
    const listingId = typeof payload.job_id === "string" ? payload.job_id.trim() : ""
    const listingType = typeof payload.listing_type === "string"
      ? payload.listing_type.trim().toLowerCase()
      : "job"

    if (!orderID) {
      return jsonResponse(req, { error: "orderID is required" }, 400)
    }
    if (!listingId) {
      return jsonResponse(req, { error: "job_id is required" }, 400)
    }
    requestLog(req)?.set({ order_id: orderID, listing_id: listingId, listing_type: listingType })

    if (listingType !== "job" && listingType !== "freelancer") {
      return jsonResponse(req, { error: "Invalid listing_type" }, 400)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const ownsListing = await verifyListingOwnership(admin, user.id, listingId, listingType)
    if (!ownsListing) {
      return jsonResponse(req, { error: "Forbidden" }, 403)
    }

    const paypalApiBase = (Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com").replace(/\/$/, "")
    const paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID") ?? ""
    const paypalSecret = paypalClientSecret()
    if (!paypalClientId || !paypalSecret) {
      return jsonResponse(req, { error: "PayPal not configured" }, 500)
    }

    const accessToken = await paypalAccessToken(req, paypalApiBase, paypalClientId, paypalSecret)
    const order = await paypalGetOrder(req, paypalApiBase, accessToken, orderID)

    const referenceId = orderReferenceId(order)
    if (referenceId !== listingId) {
      return jsonResponse(req, { error: "Order does not match listing" }, 403)
    }

    const orderStatus = String(order.status ?? "")
    if (orderStatus === "COMPLETED") {
      return jsonResponse(req, order, 200)
    }
    if (orderStatus !== "APPROVED" && orderStatus !== "CREATED") {
      return jsonResponse(req, { error: "Order is not capturable" }, 400)
    }

    const captureResponse = await paypalCaptureOrder(req, paypalApiBase, accessToken, orderID)
    return jsonResponse(req, captureResponse, 200)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    requestLog(req)?.event("paypal_capture_unhandled_error", { error: message }, "error")
    return jsonResponse(req, { error: message }, 500)
  }
})
