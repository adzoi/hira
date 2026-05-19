import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type ResolvedConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// @ts-expect-error Shared JS module used by server.mjs and Vite.
import { buildContentSecurityPolicy, buildHeadersFile, buildSecurityHeaders } from './security/csp.mjs'

const isDev = process.env.NODE_ENV !== 'production'

function securityHeadersPlugin() {
  let forDev = isDev
  return {
    name: 'gigori-security-headers',
    configResolved(config: ResolvedConfig) {
      forDev = config.command === 'serve'
    },
    transformIndexHtml(html: string) {
      const csp = buildContentSecurityPolicy({ dev: forDev })
      const tag = `    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n`
      if (html.includes('http-equiv="Content-Security-Policy"')) return html
      return html.replace('<head>', `<head>\n${tag}`)
    },
    closeBundle() {
      writeFileSync(join(process.cwd(), 'dist', '_headers'), buildHeadersFile({ dev: false }))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), securityHeadersPlugin()],
  server: {
    headers: buildSecurityHeaders({ dev: true }),
  },
  preview: {
    headers: buildSecurityHeaders({ dev: false }),
  },
})
