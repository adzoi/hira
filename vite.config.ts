import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {
  buildHeadersFile,
  buildSecurityHeaders,
  cacheControlForPath,
  generateCspNonce,
  HTML_CACHE_CONTROL,
  injectScriptNonces,
  longCacheControlForPath,
} from './security/csp.mjs'

const cspNonceStorage = new AsyncLocalStorage<string>()
const PREVIEW_STATIC_RE = /\.(?:webp|png|jpe?g|gif|svg|ico|js|css|woff2?|ttf|map|xml|txt)$/i

function urlPathname(url: string | undefined): string {
  return (url ?? '/').split('?')[0] ?? '/'
}

function stripMetaCsp(html: string) {
  return html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>\n?/i, '\n')
}

function applyDevCacheHeader(
  req: { headers: { accept?: string | string[] | undefined } },
  urlPath: string,
  res: { setHeader: (name: string, value: string) => void },
) {
  const assetCache = longCacheControlForPath(urlPath)
  if (assetCache) {
    res.setHeader('Cache-Control', assetCache)
    return
  }
  const accept = req.headers.accept
  const acceptsHtml =
    typeof accept === 'string'
      ? accept.includes('text/html')
      : Array.isArray(accept) && accept.some((value) => value.includes('text/html'))
  if (acceptsHtml) res.setHeader('Cache-Control', HTML_CACHE_CONTROL)
}

function applyPreviewCacheHeader(urlPath: string, res: { setHeader: (name: string, value: string) => void }) {
  const cacheControl = cacheControlForPath(urlPath)
  if (cacheControl) {
    res.setHeader('Cache-Control', cacheControl)
    return
  }
  if (urlPath === '/' || !PREVIEW_STATIC_RE.test(urlPath)) {
    res.setHeader('Cache-Control', HTML_CACHE_CONTROL)
  }
}

function performancePreloadsPlugin() {
  const FONT_PRELOADS = [500, 600, 700].map(
    (weight) =>
      `<link rel="preload" href="/fonts/noto-sans-georgian-${weight}.woff2" as="font" type="font/woff2" crossorigin>`,
  )

  return {
    name: 'hira-performance-preloads',
    transformIndexHtml: {
      order: 'pre',
      handler(html: string) {
        const block = FONT_PRELOADS.map((tag) => `    ${tag}`).join('\n')
        return html.replace(
          /<link rel="preload" href="\/fonts\/noto-sans-georgian-\d+\.woff2"[^>]*>\n?/g,
          '',
        ).replace('</head>', `${block}\n  </head>`)
      },
    },
    closeBundle() {
      const distDir = join(process.cwd(), 'dist')
      const indexPath = join(distDir, 'index.html')
      let html = readFileSync(indexPath, 'utf8')

      html = html.replace(
        /(<link rel="stylesheet" crossorigin href=")(\/assets\/[^"]+\.css)(">)/,
        '<link rel="preload" href="$2" as="style">\n    $1$2$3',
      )

      writeFileSync(indexPath, html)
    },
  }
}

function securityHeadersPlugin() {
  return {
    name: 'hira-security-headers',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const nonce = generateCspNonce()
        for (const [name, value] of Object.entries(buildSecurityHeaders({ dev: true, nonce }))) {
          res.setHeader(name, value)
        }
        applyDevCacheHeader(req, urlPathname(req.url), res)
        cspNonceStorage.run(nonce, () => next())
      })
    },
    configurePreviewServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        for (const [name, value] of Object.entries(buildSecurityHeaders({ dev: false }))) {
          res.setHeader(name, value)
        }
        applyPreviewCacheHeader(urlPathname(req.url), res)
        next()
      })
    },
    transformIndexHtml: {
      order: 'post',
      handler(html: string) {
        const nonce = cspNonceStorage.getStore()
        let out = stripMetaCsp(html)
        if (nonce) out = injectScriptNonces(out, nonce)
        return out
      },
    },
    closeBundle() {
      const headersBody = buildHeadersFile({ dev: false })
      const distDir = join(process.cwd(), 'dist')
      const publicDir = join(process.cwd(), 'public')
      writeFileSync(join(distDir, '_headers'), headersBody)
      writeFileSync(join(publicDir, '_headers'), headersBody)

      const indexPath = join(distDir, 'index.html')
      writeFileSync(indexPath, stripMetaCsp(readFileSync(indexPath, 'utf8')))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), performancePreloadsPlugin(), securityHeadersPlugin()],
  preview: {
    headers: buildSecurityHeaders({ dev: false }),
  },
})
