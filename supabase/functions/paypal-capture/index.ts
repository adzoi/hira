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

function paypalClientSecret(): string {
  return (
    Deno.env.get("PAYPAL_SECRET")?.trim() ||
    Deno.env.get("PAYPAL_CLIENT_SECRET")?.trim() ||
    ""
  )
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
    console.error("[paypal-capture] PayPal token error", res.status, t)
    throw new Error("PayPal authentication failed")
  }
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error("PayPal token missing")
  return data.access_token
}

/**
 * Server-side order capture (avoids client-side "Buyer access token not present" on capture).
 * @see https://developer.paypal.com/docs/api/orders/v2/#orders_capture
 */
async function paypalCaptureOrder(
  apiBase: string,
  accessToken: string,
  orderId: string,
): Promise<Record<string, unknown>> {
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
    console.error("[paypal-capture] capture failed", res.status, body)
    const msg =
      typeof body.message === "string"
        ? body.message
        : typeof body.name === "string"
          ? body.name
          : "PayPal capture failed"
    throw new Error(msg)
  }
  return body
}

async function readJsonBody(req: Request): Promise<unknown> {
  return req.json()
}

async function getPayPalAccessToken(): Promise<string> {
  const paypalApiBase = (Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com").replace(/\/$/, "")
  const paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID") ?? ""
  const paypalSecret = paypalClientSecret()
  if (!paypalClientId || !paypalSecret) {
    throw new Error("PayPal not configured")
  }
  return paypalAccessToken(paypalApiBase, paypalClientId, paypalSecret)
}

async function captureOrder(orderID: string, accessToken: string): Promise<Record<string, unknown>> {
  const paypalApiBase = (Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com").replace(/\/$/, "")
  return paypalCaptureOrder(paypalApiBase, accessToken, orderID)
}

Deno.serve(async (req: Request) => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    let payload: any
    try {
      payload = await readJsonBody(req)
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const orderID = payload?.orderID
    if (!orderID || typeof orderID !== 'string') {
      return jsonResponse({ error: 'orderID is required' }, 400)
    }

    console.log('Starting paypal-capture, orderID:', orderID)
    console.log('PAYPAL_CLIENT_ID exists:', !!Deno.env.get('PAYPAL_CLIENT_ID'))
    console.log('PAYPAL_SECRET exists:', !!Deno.env.get('PAYPAL_SECRET'))

    const accessToken = await getPayPalAccessToken()
    console.log('Got access token')

    const captureResponse = await captureOrder(orderID, accessToken)
    console.log('Capture done:', JSON.stringify(captureResponse))

    return jsonResponse(captureResponse, 200)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : ''
    console.error('UNHANDLED ERROR:', message)
    console.error('STACK:', stack)
    return jsonResponse({ error: message, stack }, 500)
  }
})
