// Server-side Open Graph tags for link-preview crawlers (Facebook, Messenger, Telegram, Viber,
// LinkedIn, X, Google…). Those bots don't run JavaScript, so the SPA's Helmet tags never reach
// them. Real visitors get the untouched index.html with no extra latency.
import { CITY_BY_SLUG } from "./citySlugs.mjs"

const SITE_URL = "https://hira.ge"
const META_TTL_MS = 10 * 60_000
const META_CACHE_MAX = 500
const FETCH_TIMEOUT_MS = 1500
/** A profile is worth indexing with a real bio, a few skills, or a review (keep in sync with src/lib/profileSeo.ts). */
const MIN_PROFILE_BIO_CHARS = 60
const MIN_PROFILE_SKILLS = 3

const CRAWLER_UA =
  /bot\b|crawler|spider|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp|telegram|viber|slack|discord|linkedin|skype|pinterest|embedly|vkshare|google-inspectiontool|applebot|yandex|bingpreview/i

/** @param {string | undefined} userAgent */
export function isLinkPreviewCrawler(userAgent) {
  return Boolean(userAgent && CRAWLER_UA.test(userAgent))
}

/** Returned when the backend answered and the page doesn't exist (as opposed to a failed lookup, which is null). */
export const SHARE_NOT_FOUND = Object.freeze({ notFound: true })

/** @type {Map<string, { expires: number; value: Promise<ShareTags | typeof SHARE_NOT_FOUND | null> }>} */
const metaCache = new Map()

/**
 * @typedef {{ title: string; description: string; image?: string; url: string; type?: string; noindex?: boolean }} ShareTags
 */

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function clip(value, max) {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

function cityLocative(city) {
  return city.endsWith("ი") ? `${city.slice(0, -1)}ში` : `${city}ში`
}

function displayCity(city) {
  return city && !String(city).startsWith("__") ? String(city) : ""
}

async function rpc(restBase, anonKey, fn, args) {
  const res = await fetch(`${restBase}/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${fn}: ${res.status}`)
  return res.json()
}

/** @returns {Promise<ShareTags | typeof SHARE_NOT_FOUND | null>} */
async function buildTags(pathname, restBase, anonKey) {
  let match = /^\/freelancer\/([^/]+)\/?$/.exec(pathname)
  if (match) {
    const slug = decodeURIComponent(match[1])
    const m = await rpc(restBase, anonKey, "get_share_meta", { p_kind: "freelancer", p_id: slug })
    if (!m) return SHARE_NOT_FOUND
    const city = displayCity(m.city)
    const bio = clip(m.bio, 200)
    const skills = Array.isArray(m.skills) ? m.skills.filter(Boolean) : []
    const reviews = Number(m.reviews ?? 0)
    const headline = [m.title, city].filter(Boolean).join(" · ")
    // Profiles with no real bio, few skills and no reviews are thin pages; keep them out of the index.
    const substantive = bio.length >= MIN_PROFILE_BIO_CHARS || skills.length >= MIN_PROFILE_SKILLS || reviews > 0
    const facts = [
      headline,
      skills.length > 0 ? `უნარები: ${skills.join(", ")}` : "",
      reviews > 0 ? `შეფასება ${Number(m.rating ?? 0).toFixed(1)} (${reviews})` : "",
    ].filter(Boolean)
    return {
      title: `${clip(m.name, 60)}${m.title ? ` - ${clip(m.title, 60)}` : ""}${city ? ` | ${city}` : ""} | ჰირა`,
      description: clip(bio || `${facts.join(". ")}. დაიქირავე ჰირაზე - ქართულ ფრილანს პლატფორმაზე.`, 200),
      image: `${SITE_URL}/og/freelancer/${encodeURIComponent(slug)}.png`,
      url: `${SITE_URL}/freelancer/${encodeURIComponent(slug)}`,
      type: "profile",
      noindex: !substantive,
    }
  }

  match = /^\/job\/([0-9a-f-]{36})\/?$/i.exec(pathname)
  if (match) {
    const m = await rpc(restBase, anonKey, "get_share_meta", { p_kind: "job", p_id: match[1] })
    if (!m) return SHARE_NOT_FOUND
    return {
      title: `${clip(m.title, 80)} | სამუშაო ჰირაზე`,
      description: clip(m.description || m.title, 200),
      image: `${SITE_URL}/og/job/${match[1]}.png`,
      url: `${SITE_URL}/job/${match[1]}`,
    }
  }

  match = /^\/listing\/([0-9a-f-]{36})\/?$/i.exec(pathname)
  if (match) {
    const m = await rpc(restBase, anonKey, "get_share_meta", { p_kind: "listing", p_id: match[1] })
    if (!m) return SHARE_NOT_FOUND
    return {
      title: `${clip(m.title, 80)}${m.name ? ` - ${clip(m.name, 40)}` : ""} | ჰირა`,
      description: clip(m.description || m.title, 200),
      image: `${SITE_URL}/og/listing/${match[1]}.png`,
      url: `${SITE_URL}/listing/${match[1]}`,
    }
  }

  match = /^\/freelancers\/([a-z0-9-]+)(?:\/([a-z-]+))?\/?$/.exec(pathname)
  if (match) {
    const city = match[2] ? CITY_BY_SLUG[match[2]] : null
    if (match[2] && !city) return SHARE_NOT_FOUND
    const m = await rpc(restBase, anonKey, "get_freelancer_landing", {
      p_category: match[1],
      p_city: city,
      p_limit: 1,
    })
    if (!m?.category) return SHARE_NOT_FOUND
    const place = city ? ` ${cityLocative(city)}` : ""
    const name = m.category.name_ka
    const count = Number(m.total_count ?? 0)
    return {
      title: `${name}${place} - ფრილანსერები | ჰირა`,
      description:
        count > 0
          ? `${name}${place}: ${count} ფრილანსერი ჰირაზე. ნახე პროფილები, შეფასებები და ფასები და დაუკავშირდი პირდაპირ.`
          : `${name}${place} - იპოვე ფრილანსერი ან გამოაქვეყნე სამუშაო ჰირაზე.`,
      url: `${SITE_URL}${pathname.replace(/\/$/, "")}`,
      noindex: count === 0,
    }
  }

  return null
}

/**
 * Cached per path; failures resolve to null so the default tags are served. A page the backend
 * says doesn't exist resolves to SHARE_NOT_FOUND so crawlers get a real 404, not a soft 404.
 * @returns {Promise<ShareTags | typeof SHARE_NOT_FOUND | null>}
 */
export function resolveShareTags(pathname, restBase, anonKey) {
  if (!restBase || !anonKey) return Promise.resolve(null)
  const now = Date.now()
  const hit = metaCache.get(pathname)
  if (hit && hit.expires > now) return hit.value

  const value = buildTags(pathname, restBase, anonKey).catch((error) => {
    console.error("[share-meta]", pathname, error instanceof Error ? error.message : error)
    return null
  })
  if (metaCache.size >= META_CACHE_MAX) {
    const oldest = metaCache.keys().next().value
    if (oldest !== undefined) metaCache.delete(oldest)
  }
  metaCache.set(pathname, { expires: now + META_TTL_MS, value })
  return value
}

/** Swap the default title/description/OG/Twitter tags in index.html for page-specific ones. */
export function injectShareTags(html, tags) {
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name="description"[^>]*>\s*/i, "")
    .replace(/<meta\s+property="og:(?:title|description|image|url|type)"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="twitter:(?:card|image|title|description)"[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/i, "")

  const lines = [
    `<title>${escapeAttr(tags.title)}</title>`,
    `<meta name="description" content="${escapeAttr(tags.description)}" />`,
    `<link rel="canonical" href="${escapeAttr(tags.url)}" />`,
    `<meta property="og:type" content="${escapeAttr(tags.type ?? "website")}" />`,
    `<meta property="og:title" content="${escapeAttr(tags.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(tags.description)}" />`,
    `<meta property="og:url" content="${escapeAttr(tags.url)}" />`,
    `<meta name="twitter:title" content="${escapeAttr(tags.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(tags.description)}" />`,
  ]
  if (tags.image) {
    lines.push(
      `<meta property="og:image" content="${escapeAttr(tags.image)}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:image" content="${escapeAttr(tags.image)}" />`,
    )
  } else {
    lines.push(
      `<meta property="og:image" content="${SITE_URL}/og-image.png" />`,
      `<meta name="twitter:card" content="summary" />`,
      `<meta name="twitter:image" content="${SITE_URL}/og-image.png" />`,
    )
  }
  if (tags.noindex) lines.push(`<meta name="robots" content="noindex, follow" />`)

  return stripped.replace(/<\/head>/i, `    ${lines.join("\n    ")}\n  </head>`)
}
