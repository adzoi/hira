import { isSupabaseConfigured, supabase } from "./supabase.ts"

type EdgeSuccess<T> = { ok: true; data: T }
type EdgeFailure = { ok: false; error: string }

function normalizeEdgeBody(data: unknown): unknown {
  if (typeof data === "string") {
    const trimmed = data.trim()
    if (!trimmed) throw new Error("Invalid edge response")
    try {
      return JSON.parse(trimmed) as unknown
    } catch {
      throw new Error("Invalid edge response")
    }
  }
  return data
}

function parseEdgeResponse<T>(data: unknown): T {
  const body = normalizeEdgeBody(data)
  if (!body || typeof body !== "object") throw new Error("Invalid edge response")
  const record = body as EdgeSuccess<T> | EdgeFailure | Record<string, unknown>

  if ("ok" in record && record.ok === true && "data" in record) {
    return record.data as T
  }
  if ("ok" in record && record.ok === false && typeof record.error === "string") {
    throw new Error(record.error)
  }

  // Edge functions without Content-Type may still arrive parsed; accept bare RPC payloads too.
  return body as T
}

/** Cached marketplace Edge Function via Supabase client (handles apikey + JWT headers). */
async function invokeMarketplaceEdge<T>(
  functionName: string,
  body?: Record<string, string | number>,
): Promise<T> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase not configured")
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    method: body ? "POST" : "GET",
    body: body ?? undefined,
  })

  if (error) {
    throw error
  }

  return parseEdgeResponse<T>(data)
}

export async function fetchHomeFeedPayload(): Promise<unknown> {
  return invokeMarketplaceEdge("get-home-feed")
}

export async function fetchListingsPagePayload(page: number): Promise<unknown> {
  return invokeMarketplaceEdge("get-listings-page", { category: "all", page })
}

export async function fetchJobsPagePayload(category: string, page: number): Promise<unknown> {
  return invokeMarketplaceEdge("get-jobs-page", { category, page })
}

export async function fetchHomepageVipPayload(limit = 20): Promise<unknown> {
  return invokeMarketplaceEdge("get-homepage-vip", { limit })
}
