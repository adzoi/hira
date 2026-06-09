import { createServer } from "node:http"
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs"
import { join, extname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  buildSecurityHeaders,
  generateCspNonce,
  injectScriptNonces,
} from "./security/csp.mjs"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist")
const host = process.env.HOST ?? "0.0.0.0"
const port = Number.parseInt(process.env.PORT ?? "3000", 10)
const staticSecurityHeaders = buildSecurityHeaders()
const indexPath = join(root, "index.html")
let indexHtmlTemplate = null

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

function sendFile(res, filePath, headers = staticSecurityHeaders) {
  applySecurityHeaders(res, headers)
  const ext = extname(filePath)
  res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream")
  createReadStream(filePath).pipe(res)
}

function sendSpaIndex(res) {
  const nonce = generateCspNonce()
  applySecurityHeaders(res, buildSecurityHeaders({ nonce }))
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.end(injectScriptNonces(getIndexHtmlTemplate(), nonce))
}

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/")
  const safePath = urlPath.replace(/\0/g, "")
  const candidate = join(root, safePath)

  if (safePath !== "/" && existsSync(candidate) && statSync(candidate).isFile()) {
    sendFile(res, candidate)
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
