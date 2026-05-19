import { createServer } from "node:http"
import { createReadStream, existsSync, statSync } from "node:fs"
import { join, extname } from "node:path"
import { fileURLToPath } from "node:url"
import { buildSecurityHeaders } from "./security/csp.mjs"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist")
const host = process.env.HOST ?? "0.0.0.0"
const port = Number.parseInt(process.env.PORT ?? "3000", 10)
const securityHeaders = buildSecurityHeaders()

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

function sendFile(res, filePath) {
  const ext = extname(filePath)
  res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream")
  createReadStream(filePath).pipe(res)
}

const server = createServer((req, res) => {
  for (const [name, value] of Object.entries(securityHeaders)) {
    res.setHeader(name, value)
  }

  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/")
  const safePath = urlPath.replace(/\0/g, "")
  const candidate = join(root, safePath)

  if (safePath !== "/" && existsSync(candidate) && statSync(candidate).isFile()) {
    sendFile(res, candidate)
    return
  }

  const indexPath = join(root, "index.html")
  if (existsSync(indexPath)) {
    sendFile(res, indexPath)
    return
  }

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
  console.log(`gigori listening on http://${host}:${port}`)
})
