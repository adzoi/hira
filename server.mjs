import { createServer } from "node:http"
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, extname, resolve, sep } from "node:path"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { brotliCompress, constants as zlibConstants, gzip, gzipSync } from "node:zlib"
import {
  buildSecurityHeaders,
  cacheControlForPath,
  generateCspNonce,
  HTML_CACHE_CONTROL,
  injectScriptNonces,
} from "./security/csp.mjs"
import { injectShareTags, isLinkPreviewCrawler, resolveShareTags } from "./seo/shareMeta.mjs"

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "dist")
const host = process.env.HOST ?? "0.0.0.0"
const port = Number.parseInt(process.env.PORT ?? "3000", 10)
const staticSecurityHeaders = buildSecurityHeaders()
const indexPath = join(root, "index.html")
let indexHtmlTemplate = null

const supabaseFunctionsBase = (
  process.env.SUPABASE_FUNCTIONS_URL ??
  (process.env.VITE_SUPABASE_URL
    ? `${process.env.VITE_SUPABASE_URL.replace(/\/$/, "")}/functions/v1`
    : "")
).replace(/\/$/, "")
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ""
const supabaseProjectUrl = (
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? supabaseFunctionsBase.replace(/\/functions\/v1$/, "")
).replace(/\/$/, "")
const supabaseRestBase = supabaseProjectUrl ? `${supabaseProjectUrl}/rest/v1` : ""
/** Responses other sites may embed (link-preview images). */
const EMBEDDABLE_HEADERS = { ...staticSecurityHeaders, "Cross-Origin-Resource-Policy": "cross-origin" }

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
}

const COMPRESSIBLE_EXT = new Set([".html", ".js", ".css", ".svg", ".json", ".xml", ".txt", ".ttf", ".ico", ".webmanifest"])
const MIN_COMPRESS_BYTES = 1024
const brotliAsync = promisify(brotliCompress)
const gzipAsync = promisify(gzip)
/** dist/ is immutable for the process lifetime, so compressed bodies are cached per file + encoding. */
const compressedCache = new Map()

/** @returns {"br" | "gzip" | null} */
function pickEncoding(req) {
  const accept = String(req.headers["accept-encoding"] ?? "")
  if (/\bbr\b/.test(accept)) return "br"
  if (/\bgzip\b/.test(accept)) return "gzip"
  return null
}

/** Runs on the libuv thread pool so large chunks don't block the event loop. */
function compressBuffer(buf, encoding) {
  return encoding === "br"
    ? brotliAsync(buf, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 9,
          [zlibConstants.BROTLI_PARAM_SIZE_HINT]: buf.length,
        },
      })
    : gzipAsync(buf, { level: 9 })
}

/** @returns {Promise<Buffer | null>} null when the file is too small or unreadable. */
function getCompressed(filePath, encoding) {
  const key = `${encoding}:${filePath}`
  let pending = compressedCache.get(key)
  if (pending === undefined) {
    pending = readFile(filePath)
      .then((raw) => (raw.length >= MIN_COMPRESS_BYTES ? compressBuffer(raw, encoding) : null))
      .catch(() => null)
    compressedCache.set(key, pending)
  }
  return pending
}

/** Compress hashed build assets in the background at boot so the first visitor isn't the one who waits. */
function warmCompressedCache() {
  const assetsDir = join(root, "assets")
  if (!existsSync(assetsDir)) return
  for (const name of readdirSync(assetsDir)) {
    if (!COMPRESSIBLE_EXT.has(extname(name))) continue
    const filePath = join(assetsDir, name)
    void getCompressed(filePath, "br")
    void getCompressed(filePath, "gzip")
  }
}

function getIndexHtmlTemplate() {
  if (indexHtmlTemplate === null) {
    indexHtmlTemplate = readFileSync(indexPath, "utf8")
  }
  return indexHtmlTemplate
}

function applySecurityHeaders(res, headers) {
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value)
  }
}

async function sendFile(req, res, filePath, urlPath, headers = staticSecurityHeaders) {
  applySecurityHeaders(res, headers)
  const ext = extname(filePath)
  res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream")
  const cacheControl = cacheControlForPath(urlPath)
  if (cacheControl) res.setHeader("Cache-Control", cacheControl)

  if (COMPRESSIBLE_EXT.has(ext)) {
    res.setHeader("Vary", "Accept-Encoding")
    const encoding = pickEncoding(req)
    if (encoding) {
      const body = await getCompressed(filePath, encoding)
      if (body) {
        res.setHeader("Content-Encoding", encoding)
        res.setHeader("Content-Length", body.length)
        res.end(req.method === "HEAD" ? undefined : body)
        return
      }
    }
  }

  createReadStream(filePath)
    .on("error", () => {
      if (!res.headersSent) res.statusCode = 500
      res.end()
    })
    .pipe(res)
}

async function sendSpaIndex(req, res, urlPath) {
  const nonce = generateCspNonce()
  applySecurityHeaders(res, buildSecurityHeaders({ nonce }))
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.setHeader("Cache-Control", HTML_CACHE_CONTROL)
  res.setHeader("Vary", "Accept-Encoding, User-Agent")
  let template = getIndexHtmlTemplate()
  if (isLinkPreviewCrawler(req.headers["user-agent"])) {
    const tags = await resolveShareTags(urlPath, supabaseRestBase, supabaseAnonKey)
    if (tags) template = injectShareTags(template, tags)
  }
  const html = injectScriptNonces(template, nonce)
  // Per-request nonce means the HTML can't be cached compressed; use fast gzip (small file).
  if (/\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
    const body = gzipSync(html, { level: 6 })
    res.setHeader("Content-Encoding", "gzip")
    res.setHeader("Content-Length", body.length)
    res.end(body)
    return
  }
  res.end(html)
}

async function proxySitemapDynamic(res) {
  if (!supabaseFunctionsBase || !supabaseAnonKey) {
    applySecurityHeaders(res, staticSecurityHeaders)
    res.statusCode = 503
    res.setHeader("Content-Type", "text/plain; charset=utf-8")
    res.end("Sitemap unavailable: configure SUPABASE_FUNCTIONS_URL and SUPABASE_ANON_KEY")
    return
  }

  try {
    const upstream = await fetch(`${supabaseFunctionsBase}/sitemap`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    })
    const body = await upstream.text()
    applySecurityHeaders(res, staticSecurityHeaders)
    res.statusCode = upstream.status
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") ?? "application/xml; charset=utf-8",
    )
    const cacheControl = upstream.headers.get("cache-control")
    if (cacheControl) res.setHeader("Cache-Control", cacheControl)
    res.end(body)
  } catch (error) {
    console.error("[sitemap-dynamic]", error)
    applySecurityHeaders(res, staticSecurityHeaders)
    res.statusCode = 502
    res.setHeader("Content-Type", "text/plain; charset=utf-8")
    res.end("Failed to fetch dynamic sitemap")
  }
}

const OG_IMAGE_PATH = /^\/og\/(freelancer|job|listing)\/([^/]{1,200})\.png$/
const OG_CACHE_TTL_MS = 30 * 60_000
const OG_CACHE_MAX = 200
/** @type {Map<string, { expires: number; status: number; body: Buffer }>} */
const ogImageCache = new Map()

/** Proxies generated link-preview images so they're served (and CDN-cached) from hira.ge. */
async function proxyOgImage(res, kind, id) {
  const key = `${kind}:${id}`
  let entry = ogImageCache.get(key)
  if (!entry || entry.expires < Date.now()) {
    entry = undefined
    if (supabaseFunctionsBase && supabaseAnonKey) {
      try {
        const upstream = await fetch(
          `${supabaseFunctionsBase}/og-image?kind=${kind}&id=${encodeURIComponent(id)}`,
          {
            headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
            signal: AbortSignal.timeout(10_000),
          },
        )
        const body = Buffer.from(await upstream.arrayBuffer())
        if (upstream.ok || upstream.status === 404) {
          entry = { expires: Date.now() + OG_CACHE_TTL_MS, status: upstream.status, body }
          if (ogImageCache.size >= OG_CACHE_MAX) {
            const oldest = ogImageCache.keys().next().value
            if (oldest !== undefined) ogImageCache.delete(oldest)
          }
          ogImageCache.set(key, entry)
        }
      } catch (error) {
        console.error("[og-image]", key, error instanceof Error ? error.message : error)
      }
    }
  }

  applySecurityHeaders(res, EMBEDDABLE_HEADERS)
  if (!entry || entry.status !== 200) {
    // Fall back to the site-wide card so a preview still shows something.
    res.statusCode = 302
    res.setHeader("Location", "/og-image.png")
    res.setHeader("Cache-Control", "public, max-age=300")
    res.end()
    return
  }
  res.setHeader("Content-Type", "image/png")
  res.setHeader("Content-Length", entry.body.length)
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=21600")
  res.end(entry.body)
}

function sendBadRequest(res) {
  applySecurityHeaders(res, staticSecurityHeaders)
  res.statusCode = 400
  res.setHeader("Content-Type", "text/plain; charset=utf-8")
  res.end("Bad request")
}

/** Resolves a URL path inside `root`, or null when it would escape it (e.g. `..` segments). */
function resolveInsideRoot(urlPath) {
  const candidate = resolve(root, `.${urlPath}`)
  return candidate === root || candidate.startsWith(root + sep) ? candidate : null
}

const server = createServer(async (req, res) => {
  let urlPath
  try {
    urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/")
  } catch {
    sendBadRequest(res)
    return
  }
  if (urlPath.includes("\0") || !urlPath.startsWith("/")) {
    sendBadRequest(res)
    return
  }
  const safePath = urlPath

  if (safePath === "/sitemap-dynamic.xml") {
    await proxySitemapDynamic(res)
    return
  }

  const ogMatch = OG_IMAGE_PATH.exec(safePath)
  if (ogMatch) {
    await proxyOgImage(res, ogMatch[1], ogMatch[2])
    return
  }

  if (safePath === "/favicon.ico") {
    const icoPath = join(root, "favicon.ico")
    if (existsSync(icoPath)) {
      await sendFile(req, res, icoPath, safePath)
      return
    }
    const fallbackPath = join(root, "icons", "hira-48.png")
    if (existsSync(fallbackPath)) {
      await sendFile(req, res, fallbackPath, safePath)
      return
    }
  }

  const candidate = resolveInsideRoot(safePath)
  if (candidate === null) {
    sendBadRequest(res)
    return
  }
  const isStaticAsset = /\.(?:webp|png|jpe?g|gif|svg|ico|js|css|woff2?|ttf|map|xml|txt)$/i.test(safePath)

  if (safePath !== "/" && existsSync(candidate) && statSync(candidate).isFile()) {
    await sendFile(req, res, candidate, safePath)
    return
  }

  if (isStaticAsset) {
    applySecurityHeaders(res, staticSecurityHeaders)
    res.statusCode = 404
    res.setHeader("Content-Type", "text/plain; charset=utf-8")
    res.end("Not found")
    return
  }

  if (existsSync(indexPath)) {
    await sendSpaIndex(req, res, safePath)
    return
  }

  applySecurityHeaders(res, staticSecurityHeaders)
  res.statusCode = 404
  res.setHeader("Content-Type", "text/plain; charset=utf-8")
  res.end("Not found")
})

process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err)
})

server.on("error", (err) => {
  if (err && typeof err === "object" && "code" in err && err.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the other process or run: PORT=${port + 1} npm start`)
    process.exit(1)
  }
  console.error(err)
  process.exit(1)
})

server.listen(port, host, () => {
  console.log(`hira listening on http://${host}:${port}`)
  warmCompressedCache()
})
