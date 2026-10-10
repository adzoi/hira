import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { enforceRateLimit, getRedis } from "../_shared/rateLimit.ts"
import { CITY_SLUGS } from "../_shared/citySlugs.ts"
import { corsHeadersFor } from "../_shared/cors.ts"
import { logStructured } from "../_shared/structuredLog.ts"
import { serveWithSentry } from "../_shared/sentry.ts"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}

const SITE_URL = "https://hira.ge"
const CACHE_TTL_SECONDS = 3600
const PAGE_SIZE = 1000
/** Category × city pages need at least this many freelancers to be listed (avoids thin pages). */
const MIN_FREELANCERS_PER_CITY_PAGE = 2
/** Profiles need a real bio (or a review) to be listed (keep in sync with src/lib/profileSeo.ts). */
const MIN_PROFILE_BIO_CHARS = 60

type SitemapEntry = {
  loc: string
  lastmod?: string
  changefreq?: string
  priority?: string
}

const STATIC_PAGES: ReadonlyArray<{ path: string; changefreq: string; priority: string }> = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/browse", changefreq: "daily", priority: "0.9" },
  { path: "/listings", changefreq: "daily", priority: "0.9" },
  { path: "/jobs", changefreq: "daily", priority: "0.9" },
  { path: "/hirers", changefreq: "daily", priority: "0.8" },
  { path: "/freelancers", changefreq: "weekly", priority: "0.8" },
  { path: "/internships", changefreq: "daily", priority: "0.7" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/guide", changefreq: "monthly", priority: "0.7" },
  { path: "/faq", changefreq: "monthly", priority: "0.7" },
  { path: "/terms", changefreq: "yearly", priority: "0.4" },
  { path: "/privacy", changefreq: "yearly", priority: "0.4" },
  { path: "/cookies", changefreq: "yearly", priority: "0.4" },
  { path: "/data-deletion", changefreq: "yearly", priority: "0.4" },
  { path: "/login", changefreq: "monthly", priority: "0.5" },
  { path: "/register", changefreq: "monthly", priority: "0.5" },
]

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function toLastmod(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined
  const date = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
}

function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`
}

function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.loc)}</loc>`]
      if (entry.lastmod) parts.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`)
      if (entry.changefreq) parts.push(`    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`)
      if (entry.priority) parts.push(`    <priority>${escapeXml(entry.priority)}</priority>`)
      return `  <url>\n${parts.join("\n")}\n  </url>`
    })
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

function staticEntries(): SitemapEntry[] {
  return STATIC_PAGES.map(({ path, changefreq, priority }) => ({
    loc: absoluteUrl(path),
    changefreq,
    priority,
  }))
}

type RowWithDates = {
  updated_at?: string | null
  created_at?: string | null
}

async function fetchAllRows<T extends RowWithDates>(
  label: string,
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  let offset = 0

  while (true) {
    const { data, error } = await fetchPage(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`${label}: ${error.message}`)
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return rows
}

async function fetchPublicJobEntries(admin: ReturnType<typeof createClient>): Promise<SitemapEntry[]> {
  const nowIso = new Date().toISOString()
  const rows = await fetchAllRows("jobs", (from, to) =>
    admin
      .from("jobs")
      .select("id, updated_at, created_at")
      .eq("status", "open")
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false })
      .range(from, to),
  )

  return rows.map((row) => ({
    loc: absoluteUrl(`/job/${row.id}`),
    lastmod: toLastmod(row.updated_at ?? row.created_at),
    changefreq: "weekly",
    priority: "0.7",
  }))
}

async function fetchPublicFreelancerEntries(admin: ReturnType<typeof createClient>): Promise<SitemapEntry[]> {
  const rows = await fetchAllRows("freelancer_profiles", (from, to) =>
    admin
      .from("freelancer_profiles")
      .select("slug, bio, total_reviews_count, updated_at, created_at")
      .eq("is_public", true)
      .eq("is_profile_complete", true)
      .not("slug", "is", null)
      .neq("slug", "")
      .order("updated_at", { ascending: false })
      .range(from, to),
  )

  return rows
    .filter((row) => typeof row.slug === "string" && row.slug.trim().length > 0)
    // Only list profiles worth indexing (real bio or a review); thin ones stay out of the sitemap.
    .filter((row) => (row.bio ?? "").replace(/\s+/g, " ").trim().length >= MIN_PROFILE_BIO_CHARS || (row.total_reviews_count ?? 0) > 0)
    .map((row) => ({
      loc: absoluteUrl(`/freelancer/${encodeURIComponent(row.slug.trim())}`),
      lastmod: toLastmod(row.updated_at ?? row.created_at),
      changefreq: "weekly",
      priority: "0.8",
    }))
}

async function fetchPublicListingEntries(admin: ReturnType<typeof createClient>): Promise<SitemapEntry[]> {
  const rows = await fetchAllRows("services", (from, to) =>
    admin
      .from("services")
      .select("id, updated_at, created_at, freelancer_profiles!inner(is_public)")
      .eq("is_active", true)
      .eq("freelancer_profiles.is_public", true)
      .order("updated_at", { ascending: false })
      .range(from, to),
  )

  return rows.map((row) => ({
    loc: absoluteUrl(`/listing/${row.id}`),
    lastmod: toLastmod(row.updated_at ?? row.created_at),
    changefreq: "weekly",
    priority: "0.7",
  }))
}

type LandingIndex = {
  categories?: Array<{ slug: string; count: number }>
  combos?: Array<{ slug: string; city: string; count: number }>
}

async function fetchLandingEntries(admin: ReturnType<typeof createClient>): Promise<SitemapEntry[]> {
  const { data, error } = await admin.rpc("get_freelancer_landing_index")
  if (error) throw new Error(`landing index: ${error.message}`)
  const index = (data ?? {}) as LandingIndex
  const entries: SitemapEntry[] = []
  for (const category of index.categories ?? []) {
    if (category.count < 1) continue
    entries.push({
      loc: absoluteUrl(`/freelancers/${encodeURIComponent(category.slug)}`),
      changefreq: "weekly",
      priority: "0.7",
    })
  }
  for (const combo of index.combos ?? []) {
    const citySlug = CITY_SLUGS[combo.city]
    if (!citySlug || combo.count < MIN_FREELANCERS_PER_CITY_PAGE) continue
    entries.push({
      loc: absoluteUrl(`/freelancers/${encodeURIComponent(combo.slug)}/${citySlug}`),
      changefreq: "weekly",
      priority: "0.6",
    })
  }
  return entries
}

async function buildSitemap(admin: ReturnType<typeof createClient>): Promise<string> {
  const [jobs, freelancers, listings, landing] = await Promise.all([
    fetchPublicJobEntries(admin),
    fetchPublicFreelancerEntries(admin),
    fetchPublicListingEntries(admin),
    // Landing pages are optional: a missing migration must not take the whole sitemap down.
    fetchLandingEntries(admin).catch((error) => {
      logStructured("error", "sitemap", "landing_index_failed", { error: String(error) })
      return [] as SitemapEntry[]
    }),
  ])

  const entries = [...staticEntries(), ...landing, ...freelancers, ...listings, ...jobs]
  return buildSitemapXml(entries)
}

function xmlResponse(req: Request, body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: corsHeadersFor(req, {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
    }),
  })
}

serveWithSentry("sitemap", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeadersFor(req) })
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeadersFor(req, { "Content-Type": "text/plain; charset=utf-8" }),
    })
  }

  const rateLimited = await enforceRateLimit(
    req,
    { prefix: "rl:sitemap", requests: 120, window: "1 m" },
    corsHeadersFor(req),
  )
  if (rateLimited) return rateLimited

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) {
    return xmlResponse(req, buildSitemapXml([]), 500)
  }

  const redis = getRedis()
  const cacheKey = "sitemap:xml:v3"

  if (redis) {
    try {
      const cached = await redis.get(cacheKey)
      if (typeof cached === "string" && cached.length > 0) {
        return xmlResponse(req, cached)
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })
    const xml = await buildSitemap(admin)

    if (redis) {
      try {
        await redis.setex(cacheKey, CACHE_TTL_SECONDS, xml)
      } catch {
        /* ignore cache write failures */
      }
    }

    return xmlResponse(req, xml)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logStructured("error", "sitemap", "sitemap_build_failed", { error: message })
    return xmlResponse(req, buildSitemapXml(staticEntries()), 500)
  }
})
