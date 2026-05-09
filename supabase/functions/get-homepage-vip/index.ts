import { Redis } from "https://esm.sh/@upstash/redis@1.20.1"
import { Ratelimit } from "https://esm.sh/@upstash/ratelimit@0.4.4"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  })
}

type VipFeedItem = {
  type: "job" | "freelancer"
  id: string
  title: string
  name: string
  vip_expires_at: string
  subtitle: string
  description: string
  avatarUrl: string | null
  rating: number
  href: string
}

function oneLine(raw: unknown, max = 120): string {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim()
  if (!text) return "დეტალები განცხადების გვერდზე."
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`
}

function stripServiceMeta(raw: unknown): string {
  const value = String(raw ?? "")
  const prefix = "<!--gigori-meta:"
  const suffix = "-->"
  if (!value.startsWith(prefix)) return value
  const endIdx = value.indexOf(suffix)
  if (endIdx < 0) return value
  return value.slice(endIdx + suffix.length).trim()
}

const CACHE_TTL = 60 // seconds

async function fetchHomepageVipData(
  admin: ReturnType<typeof createClient>,
  limit: number,
): Promise<{ ok: true; items: VipFeedItem[] } | { ok: false; error: string }> {
  const nowIso = new Date().toISOString()

  const { data: vipJobs, error: jobsErr } = await admin
    .from("jobs")
    .select(
      `
      id,
      title,
      description,
      vip_expires_at,
      hirer_profiles (
        id,
        user_id,
        company_name,
        average_rating_given,
        profiles:profiles!hirer_profiles_user_id_fkey (
          full_name,
          avatar_url
        )
      )
    `,
    )
    .eq("is_vip", true)
    .eq("status", "open")
    .gt("vip_expires_at", nowIso)
    .order("vip_expires_at", { ascending: false })
    .limit(limit)
  if (jobsErr) {
    return { ok: false, error: jobsErr.message }
  }

  const { data: vipPayments, error: payErr } = await admin
    .from("vip_payments")
    .select("listing_id, completed_at, vip_days")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(500)
  if (payErr) {
    return { ok: false, error: payErr.message }
  }

  const hirerReviewKeys = [
    ...new Set(
      (vipJobs ?? [])
        .map((row) => {
          const hp = (row as { hirer_profiles?: unknown }).hirer_profiles
          const hirer = Array.isArray(hp) ? hp[0] : hp
          const userId = String((hirer as { user_id?: string | null } | undefined)?.user_id ?? "").trim()
          const profileId = String((hirer as { id?: string | null } | undefined)?.id ?? "").trim()
          return [userId, profileId]
        })
        .flat()
        .filter(Boolean),
    ),
  ]
  const hirerRatingTotals = new Map<string, { sum: number; count: number }>()
  if (hirerReviewKeys.length > 0) {
    const { data: reviewRows, error: reviewErr } = await admin
      .from("reviews")
      .select("reviewee_id,rating_overall")
      .in("reviewee_id", hirerReviewKeys)
      .limit(5000)
    if (!reviewErr) {
      for (const r of reviewRows ?? []) {
        const revieweeId = String((r as { reviewee_id?: string | null }).reviewee_id ?? "").trim()
        if (!revieweeId) continue
        const rating = Number((r as { rating_overall?: number | null }).rating_overall ?? 0)
        if (!Number.isFinite(rating)) continue
        const prev = hirerRatingTotals.get(revieweeId) ?? { sum: 0, count: 0 }
        prev.sum += rating
        prev.count += 1
        hirerRatingTotals.set(revieweeId, prev)
      }
    }
  }

  const activeServiceExpiry = new Map<string, string>()
  const nowMs = Date.now()
  for (const row of vipPayments ?? []) {
    const listingId = String((row as { listing_id?: string }).listing_id ?? "")
    const completedAtRaw = String((row as { completed_at?: string | null }).completed_at ?? "")
    const vipDays = Number((row as { vip_days?: number | null }).vip_days ?? 0)
    if (!listingId || !completedAtRaw || !Number.isFinite(vipDays) || vipDays <= 0) continue
    const expiresMs = new Date(completedAtRaw).getTime() + vipDays * 24 * 60 * 60 * 1000
    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) continue
    const prev = activeServiceExpiry.get(listingId)
    if (!prev || expiresMs > new Date(prev).getTime()) {
      activeServiceExpiry.set(listingId, new Date(expiresMs).toISOString())
    }
  }

  const serviceIds = [...activeServiceExpiry.keys()].slice(0, 500)
  let vipServices:
    | Array<{
        id: string
        title: string | null
        description: string | null
        freelancer_profiles:
          | {
              user_id: string | null
              slug: string | null
              professional_title: string | null
              average_rating: number | null
              profiles: { full_name: string | null; avatar_url: string | null } | null
            }
          | Array<{
              user_id: string | null
              slug: string | null
              professional_title: string | null
              average_rating: number | null
              profiles: { full_name: string | null; avatar_url: string | null } | null
            }>
      }>
    | null = null

  if (serviceIds.length > 0) {
    const { data: servicesRows, error: servicesErr } = await admin
      .from("services")
      .select(
        `
        id,
        title,
        description,
        freelancer_profiles (
          user_id,
          slug,
          professional_title,
          average_rating,
          profiles:profiles!freelancer_profiles_user_id_fkey (
            full_name,
            avatar_url
          )
        )
      `,
      )
      .eq("is_active", true)
      .in("id", serviceIds)
      .limit(500)
    if (servicesErr) {
      return { ok: false, error: servicesErr.message }
    }
    vipServices = servicesRows as typeof vipServices
  }

  const freelancerUserIds = [
    ...new Set(
      (vipServices ?? [])
        .map((row) => {
          const fp = row.freelancer_profiles
          const freelancer = Array.isArray(fp) ? fp[0] : fp
          return String(freelancer?.user_id ?? "").trim()
        })
        .filter(Boolean),
    ),
  ]
  const freelancerRatingTotals = new Map<string, { sum: number; count: number }>()
  if (freelancerUserIds.length > 0) {
    const { data: reviewRows, error: reviewErr } = await admin
      .from("reviews")
      .select("reviewee_id,rating_overall")
      .in("reviewee_id", freelancerUserIds)
      .limit(5000)
    if (!reviewErr) {
      for (const r of reviewRows ?? []) {
        const revieweeId = String((r as { reviewee_id?: string | null }).reviewee_id ?? "").trim()
        if (!revieweeId) continue
        const rating = Number((r as { rating_overall?: number | null }).rating_overall ?? 0)
        if (!Number.isFinite(rating)) continue
        const prev = freelancerRatingTotals.get(revieweeId) ?? { sum: 0, count: 0 }
        prev.sum += rating
        prev.count += 1
        freelancerRatingTotals.set(revieweeId, prev)
      }
    }
  }

  const out: VipFeedItem[] = []

  for (const row of vipJobs ?? []) {
    const hp = (row as { hirer_profiles?: unknown }).hirer_profiles
    const hirer = Array.isArray(hp) ? hp[0] : hp
    const displayName = String(
      (hirer as { company_name?: string | null; profiles?: { full_name?: string | null } | null } | undefined)?.company_name ??
        (hirer as { profiles?: { full_name?: string | null } | null } | undefined)?.profiles?.full_name ??
        "დამქირავებელი",
    ).trim()
    const avatarUrl =
      (hirer as { profiles?: { avatar_url?: string | null } | null } | undefined)?.profiles?.avatar_url ?? null
    const ownerUid = String((hirer as { user_id?: string | null } | undefined)?.user_id ?? "").trim()
    const hirerProfileId = String((hirer as { id?: string | null } | undefined)?.id ?? "").trim()
    const fallbackRating = Number((hirer as { average_rating_given?: number | null } | undefined)?.average_rating_given ?? 0)
    const totals = (ownerUid && hirerRatingTotals.get(ownerUid)) || (hirerProfileId && hirerRatingTotals.get(hirerProfileId))
    const ratingRaw =
      totals && totals.count > 0 && Number.isFinite(totals.sum / totals.count) ? totals.sum / totals.count : fallbackRating
    out.push({
      type: "job",
      id: String((row as { id?: string }).id ?? ""),
      title: String((row as { title?: string | null }).title ?? "VIP Job").trim() || "VIP Job",
      name: displayName,
      vip_expires_at: String((row as { vip_expires_at?: string | null }).vip_expires_at ?? nowIso),
      subtitle: "დამქირავებელი",
      description: oneLine((row as { description?: string | null }).description),
      avatarUrl,
      rating: Number.isFinite(ratingRaw) ? ratingRaw : 0,
      href: `/job/${encodeURIComponent(String((row as { id?: string }).id ?? ""))}`,
    })
  }

  for (const row of vipServices ?? []) {
    const fp = row.freelancer_profiles
    const freelancer = Array.isArray(fp) ? fp[0] : fp
    const slug = String(freelancer?.slug ?? "").trim()
    if (!slug) continue
    const serviceId = String(row.id ?? "")
    const expiresAt = activeServiceExpiry.get(serviceId) ?? nowIso
    const displayName = String(freelancer?.profiles?.full_name ?? "ფრილანსერი").trim()
    const ownerUid = String(freelancer?.user_id ?? "").trim()
    const fallbackRating = Number(freelancer?.average_rating ?? 0)
    const totals = ownerUid ? freelancerRatingTotals.get(ownerUid) : undefined
    const ratingRaw =
      totals && totals.count > 0 && Number.isFinite(totals.sum / totals.count) ? totals.sum / totals.count : fallbackRating
    out.push({
      type: "freelancer",
      id: serviceId,
      title: String(row.title ?? "VIP Listing").trim() || "VIP Listing",
      name: displayName,
      vip_expires_at: expiresAt,
      subtitle: String(freelancer?.professional_title ?? "ფრილანსერი").trim() || "ფრილანსერი",
      description: oneLine(stripServiceMeta(row.description)),
      avatarUrl: freelancer?.profiles?.avatar_url ?? null,
      rating: Number.isFinite(ratingRaw) ? ratingRaw : 0,
      href: `/listing/${encodeURIComponent(serviceId)}`,
    })
  }

  out.sort((a, b) => new Date(b.vip_expires_at).getTime() - new Date(a.vip_expires_at).getTime())

  const deduped = new Map<string, VipFeedItem>()
  for (const item of out) {
    const key = `${item.type}:${item.id}`
    if (!deduped.has(key)) deduped.set(key, item)
  }

  return { ok: true, items: [...deduped.values()].slice(0, limit) }
}

function isCachedVipPayload(v: unknown): v is { ok: true; items: VipFeedItem[] } {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return o.ok === true && Array.isArray(o.items)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: "Missing Supabase env" }, 500)
  }

  // ── Rate limiting ────────────────────────────────────────────────────────
  let redis: Redis | null = null
  try {
    if (Deno.env.get("UPSTASH_REDIS_REST_URL") && Deno.env.get("UPSTASH_REDIS_REST_TOKEN")) {
      redis = Redis.fromEnv()
    }
  } catch {
    redis = null
  }

  if (redis) {
    try {
      const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "10 s"),
        analytics: false,
        prefix: "rl:homepage-vip",
      })
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        "anonymous"
      const { success } = await ratelimit.limit(ip)
      if (!success) {
        return jsonResponse({ ok: false, error: "Too many requests" }, 429)
      }
    } catch {
      // Fail open — don't block real users if rate limit check fails
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  let limit = 20
  if (req.method === "GET") {
    const u = new URL(req.url)
    const n = Number.parseInt(u.searchParams.get("limit") ?? "20", 10)
    if (Number.isFinite(n)) limit = Math.max(1, Math.min(20, n))
  } else {
    try {
      const body = (await req.json()) as { limit?: number }
      if (Number.isFinite(body?.limit)) {
        limit = Math.max(1, Math.min(20, Number(body.limit)))
      }
    } catch {
      /* optional body */
    }
  }

  const cacheKey = `homepage:vip:${limit}`

  if (redis) {
    try {
      const cached = await redis.get(cacheKey)
      if (cached != null) {
        let parsed: unknown = cached
        if (typeof cached === "string") {
          try {
            parsed = JSON.parse(cached)
          } catch {
            parsed = null
          }
        }
        if (isCachedVipPayload(parsed)) {
          return jsonResponse(parsed)
        }
      }
    } catch {
      /* Redis read failed — fall through to DB */
    }
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const data = await fetchHomepageVipData(admin, limit)
  if (!data.ok) {
    return jsonResponse({ ok: false, error: data.error }, 500)
  }

  if (redis) {
    try {
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(data))
    } catch {
      /* ignore cache write failures */
    }
  }

  return jsonResponse(data)
})