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

function stripMetaCsp(html: string) {
  return html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>\n?/i, '\n')
}

function securityHeadersPlugin() {
  return {
    name: 'hira-security-headers',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((_req, res, next) => {
        const nonce = generateCspNonce()
        for (const [name, value] of Object.entries(buildSecurityHeaders({ dev: true, nonce }))) {
          res.setHeader(name, value)
        }
        cspNonceStorage.run(nonce, () => next())
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
