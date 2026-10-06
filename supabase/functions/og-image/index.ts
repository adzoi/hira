// Link-preview images (1200×630 PNG) for freelancer profiles, jobs and listings.
// Served to crawlers through hira.ge/og/<kind>/<id>.png (server.mjs proxies and caches).
import satori from "npm:satori@0.12.2"
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { getRedis } from "../_shared/rateLimit.ts"
import { serveWithSentry } from "../_shared/sentry.ts"
import { logStructured } from "../_shared/structuredLog.ts"
import { buildCard, type ShareMeta } from "./card.ts"

declare const Deno: {
  env: { get: (key: string) => string | undefined }
}

const CACHE_TTL_SECONDS = 6 * 3600
const CACHE_PREFIX = "og:v1"
const KINDS = new Set(["freelancer", "job", "listing"])
const MAX_AVATAR_BYTES = 1_500_000

const GEORGIAN = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-georgian@5.3.0/files"
const LATIN = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans@5.2.10/files"

async function loadFont(url: string, name: string, weight: 400 | 700) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`font ${url}: ${res.status}`)
  return { name, data: await res.arrayBuffer(), weight, style: "normal" as const }
}

// Module scope: fonts and the resvg wasm load once per warm instance.
// Georgian-only, Latin and Latin-ext (₾) are separate families so satori falls back per glyph.
const fontsReady = Promise.all([
  loadFont(`${GEORGIAN}/noto-sans-georgian-georgian-400-normal.woff`, "Noto Sans Georgian", 400),
  loadFont(`${GEORGIAN}/noto-sans-georgian-georgian-700-normal.woff`, "Noto Sans Georgian", 700),
  loadFont(`${LATIN}/noto-sans-latin-400-normal.woff`, "Noto Sans", 400),
  loadFont(`${LATIN}/noto-sans-latin-700-normal.woff`, "Noto Sans", 700),
  loadFont(`${LATIN}/noto-sans-latin-ext-400-normal.woff`, "Noto Sans Ext", 400),
  loadFont(`${LATIN}/noto-sans-latin-ext-700-normal.woff`, "Noto Sans Ext", 700),
])
const resvgReady = initWasm(fetch("https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm"))

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Avatar as a data URI, only for PNG/JPEG on our own storage (satori can't decode WebP,
 * and fetching arbitrary URLs would be an SSRF vector). Anything else falls back to initials.
 */
async function avatarDataUri(avatarUrl: string | null | undefined, supabaseUrl: string): Promise<string | null> {
  const raw = avatarUrl?.trim()
  if (!raw) return null
  const url = /^https?:\/\//i.test(raw)
    ? raw
    : `${supabaseUrl}/storage/v1/object/public/avatars/${raw.replace(/^\/+/, "").replace(/^avatars\//, "")}`
  try {
    if (new URL(url).origin !== new URL(supabaseUrl).origin) return null
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
    const type = res.headers.get("content-type") ?? ""
    if (!res.ok || !/^image\/(png|jpe?g)$/i.test(type)) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length > MAX_AVATAR_BYTES) return null
    return `data:${type};base64,${bytesToBase64(bytes)}`
  } catch {
    return null
  }
}

function pngResponse(bytes: Uint8Array): Response {
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": `public, max-age=3600, s-maxage=${CACHE_TTL_SECONDS}`,
    },
  })
}

serveWithSentry("og-image", async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 })

  const params = new URL(req.url).searchParams
  const kind = params.get("kind") ?? ""
  const id = (params.get("id") ?? "").trim()
  if (!KINDS.has(kind) || !id || id.length > 200) return new Response("Bad request", { status: 400 })

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) return new Response("Server misconfigured", { status: 500 })

  const redis = getRedis()
  const cacheKey = `${CACHE_PREFIX}:${kind}:${id}`
  if (redis) {
    try {
      const cached = await redis.get<string>(cacheKey)
      if (typeof cached === "string" && cached.length > 0) return pngResponse(base64ToBytes(cached))
    } catch {
      /* render fresh */
    }
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: meta, error } = await admin.rpc("get_share_meta", { p_kind: kind, p_id: id })
  if (error) {
    logStructured("error", "og-image", "share_meta_failed", { kind, error: error.message })
    return new Response("Internal error", { status: 500 })
  }
  if (!meta) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=300" } })

  const shareMeta = meta as ShareMeta & { avatar_url?: string | null }
  try {
    const [fonts, avatar] = await Promise.all([
      fontsReady,
      kind === "freelancer" ? avatarDataUri(shareMeta.avatar_url, supabaseUrl) : Promise.resolve(null),
      resvgReady,
    ])
    const svg = await satori(buildCard(shareMeta, avatar) as never, { width: 1200, height: 630, fonts })
    const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng()

    if (redis) {
      redis.setex(cacheKey, CACHE_TTL_SECONDS, bytesToBase64(png)).catch(() => {})
    }
    return pngResponse(png)
  } catch (renderError) {
    logStructured("error", "og-image", "render_failed", { kind, error: String(renderError) })
    return new Response("Render failed", { status: 500 })
  }
})
