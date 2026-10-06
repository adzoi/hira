import { getRedis, rateLimitAndReadCache, writeCacheInBackground } from "../_shared/rateLimit.ts"
// @ts-ignore: URL imports are resolved at Supabase Edge runtime (Deno), not by local TS server.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { corsHeadersFor } from "../_shared/cors.ts"
import { serveWithSentry } from "../_shared/sentry.ts"
import { requestLog } from "../_shared/structuredLog.ts"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeadersFor(req),
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

type ProfileEmbed = {
  full_name: string | null
  avatar_url: string | null
}

type HirerProfileEmbed = {
  id: string | null
  user_id: string | null
  company_name: string | null
  average_rating_given: number | null
  profiles: ProfileEmbed | null
}

type VipJobRow = {
  id: string
  title: string | null
  description: string | null
  vip_expires_at: string | null
  hirer_profiles: HirerProfileEmbed | HirerProfileEmbed[] | null
}

type FreelancerProfileEmbed = {
  user_id: string | null
  slug: string | null
  professional_title: string | null
  average_rating: number | null
  profiles: ProfileEmbed | null
}

type VipServiceRow = {
  id: string
  title: string | null
  description: string | null
  vip_expires_at: string | null
  freelancer_profiles: FreelancerProfileEmbed | FreelancerProfileEmbed[] | null
}

type ReviewRow = {
  reviewee_id: string | null
  rating_overall: number | null
}

function firstRelation<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0]
  return value ?? undefined
}

function oneLine(raw: unknown, max = 120): string {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim()
  if (!text) return "დეტალები განცხადების გვერდზე."
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`
}

function stripServiceMeta(raw: unknown): string {
  const value = String(raw ?? "")
  const suffix = "-->"
  const prefix = value.startsWith("<!--hira-meta:")
    ? "<!--hira-meta:"
    : value.startsWith("<!--gigori-meta:")
      ? "<!--gigori-meta:"
      : null
  if (!prefix) return value
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
  const jobs = (vipJobs ?? []) as VipJobRow[]

  const hirerReviewKeys = [
    ...new Set(
      jobs
        .map((row) => {
          const hirer = firstRelation(row.hirer_profiles)
          const userId = String(hirer?.user_id ?? "").trim()
          const profileId = String(hirer?.id ?? "").trim()
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
      for (const r of (reviewRows ?? []) as ReviewRow[]) {
        const revieweeId = String(r.reviewee_id ?? "").trim()
        if (!revieweeId) continue
        const rating = Number(r.rating_overall ?? 0)
        if (!Number.isFinite(rating)) continue
        const prev = hirerRatingTotals.get(revieweeId) ?? { sum: 0, count: 0 }
        prev.sum += rating
        prev.count += 1
        hirerRatingTotals.set(revieweeId, prev)
      }
    }
  }

  const { data: servicesRows, error: servicesErr } = await admin
    .from("services")
    .select(
      `
      id,
      title,
      description,
      vip_expires_at,
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
    .eq("is_vip", true)
    .gt("vip_expires_at", nowIso)
    .order("vip_expires_at", { ascending: false })
    .limit(limit)
  if (servicesErr) {
    return { ok: false, error: servicesErr.message }
  }
  const vipServices = (servicesRows ?? []) as VipServiceRow[]

  const freelancerUserIds = [
    ...new Set(
      vipServices
        .map((row) => {
          const freelancer = firstRelation(row.freelancer_profiles)
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
      for (const r of (reviewRows ?? []) as ReviewRow[]) {
        const revieweeId = String(r.reviewee_id ?? "").trim()
        if (!revieweeId) continue
        const rating = Number(r.rating_overall ?? 0)
        if (!Number.isFinite(rating)) continue
        const prev = freelancerRatingTotals.get(revieweeId) ?? { sum: 0, count: 0 }
        prev.sum += rating
        prev.count += 1
        freelancerRatingTotals.set(revieweeId, prev)
      }
    }
  }

  const out: VipFeedItem[] = []

  for (const row of jobs) {
    const hirer = firstRelation(row.hirer_profiles)
    const displayName = String(hirer?.company_name ?? hirer?.profiles?.full_name ?? "დამქირავებელი").trim()
    const avatarUrl = hirer?.profiles?.avatar_url ?? null
    const ownerUid = String(hirer?.user_id ?? "").trim()
    const hirerProfileId = String(hirer?.id ?? "").trim()
    const fallbackRating = Number(hirer?.average_rating_given ?? 0)
    const totals = (ownerUid && hirerRatingTotals.get(ownerUid)) || (hirerProfileId && hirerRatingTotals.get(hirerProfileId))
    const ratingRaw =
      totals && totals.count > 0 && Number.isFinite(totals.sum / totals.count) ? totals.sum / totals.count : fallbackRating
    const jobId = String(row.id ?? "")
    out.push({
      type: "job",
      id: jobId,
      title: String(row.title ?? "VIP Job").trim() || "VIP Job",
      name: displayName,
      vip_expires_at: String(row.vip_expires_at ?? nowIso),
      subtitle: "დამქირავებელი",
      description: oneLine(row.description),
      avatarUrl,
      rating: Number.isFinite(ratingRaw) ? ratingRaw : 0,
      href: `/job/${encodeURIComponent(jobId)}`,
    })
  }

  for (const row of vipServices) {
    const freelancer = firstRelation(row.freelancer_profiles)
    const slug = String(freelancer?.slug ?? "").trim()
    if (!slug) continue
    const serviceId = String(row.id ?? "")
    const expiresAt = String(row.vip_expires_at ?? nowIso)
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

serveWithSentry("get-homepage-vip", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeadersFor(req) })
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { ok: false, error: "Missing Supabase env" }, 500)
  }

  const redis = getRedis()

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

  // Rate-limit check and cache read run in parallel (two Upstash round trips → one).
  const { limited, cached } = await rateLimitAndReadCache(
    req,
    { prefix: "rl:homepage-vip", requests: 10, window: "10 s" },
    corsHeadersFor(req),
    redis,
    cacheKey,
  )
  if (limited) return limited
  if (isCachedVipPayload(cached)) return jsonResponse(req, cached)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })


  const data = await fetchHomepageVipData(admin, limit)
  if (!data.ok) {
    requestLog(req)?.event("homepage_vip_query_failed", { error: data.error }, "error")
    return jsonResponse(req, { ok: false, error: "Internal server error" }, 500)
  }

  writeCacheInBackground(redis, cacheKey, CACHE_TTL, data)

  return jsonResponse(req, data)
})