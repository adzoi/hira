import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {
  buildHeadersFile,
  buildSecurityHeaders,
  generateCspNonce,
  injectScriptNonces,
} from './security/csp.mjs'

const cspNonceStorage = new AsyncLocalStorage<string>()
const LONG_CACHE = 'public, max-age=31536000, immutable'

function assetCacheControl(urlPath: string): string | null {
  const path = urlPath.split('?')[0] ?? urlPath
  if (path.startsWith('/assets/')) return LONG_CACHE
  if (/\.(?:js|css|webp|png|jpe?g|svg|woff2|ttf)$/i.test(path)) return LONG_CACHE
  return null
}

function stripMetaCsp(html: string) {
  return html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>\n?/i, '\n')
}

function applyAssetCacheHeader(urlPath: string, res: { setHeader: (name: string, value: string) => void }) {
  const cacheControl = assetCacheControl(urlPath)
  if (cacheControl) res.setHeader('Cache-Control', cacheControl)
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
        applyAssetCacheHeader(req.url ?? '/', res)
        cspNonceStorage.run(nonce, () => next())
      })
    },
    configurePreviewServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        for (const [name, value] of Object.entries(buildSecurityHeaders({ dev: false }))) {
          res.setHeader(name, value)
        }
        applyAssetCacheHeader(req.url ?? '/', res)
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
  plugins: [react(), tailwindcss(), securityHeadersPlugin()],
  preview: {
    headers: buildSecurityHeaders({ dev: false }),
  },
})
