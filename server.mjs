import { createServer } from "node:http"
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs"
import { join, extname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  buildSecurityHeaders,
  generateCspNonce,
  injectScriptNonces,
  longCacheControlForPath,
} from "./security/csp.mjs"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist")
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

function sendFile(res, filePath, urlPath, headers = staticSecurityHeaders) {
  applySecurityHeaders(res, headers)
  const ext = extname(filePath)
  res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream")
  const cacheControl = longCacheControlForPath(urlPath)
  if (cacheControl) res.setHeader("Cache-Control", cacheControl)
  createReadStream(filePath).pipe(res)
}

function sendSpaIndex(res) {
  const nonce = generateCspNonce()
  applySecurityHeaders(res, buildSecurityHeaders({ nonce }))
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.end(injectScriptNonces(getIndexHtmlTemplate(), nonce))
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

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/")
  const safePath = urlPath.replace(/\0/g, "")

  if (safePath === "/sitemap-dynamic.xml") {
    await proxySitemapDynamic(res)
    return
  }

  const candidate = join(root, safePath)

  if (safePath !== "/" && existsSync(candidate) && statSync(candidate).isFile()) {
    sendFile(res, candidate, safePath)
    return
  }

  if (existsSync(indexPath)) {
    sendSpaIndex(res)
    return
  }

  applySecurityHeaders(res, staticSecurityHeaders)
  res.statusCode = 404
  res.setHeader("Content-Type", "text/plain; charset=utf-8")
  res.end("Not found")
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
})
