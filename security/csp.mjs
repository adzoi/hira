import { randomBytes } from "node:crypto"

/** Directives that must be sent via HTTP headers, not `<meta http-equiv="Content-Security-Policy">`. */
const META_UNSUPPORTED_DIRECTIVES = new Set(["frame-ancestors"])

/** @returns {string} Base64 nonce suitable for CSP `script-src 'nonce-…'`. */
export function generateCspNonce() {
  return randomBytes(16).toString("base64")
}

/** Add `nonce` to every `<script>` that does not already have one. */
export function injectScriptNonces(html, nonce) {
  return html.replace(/<script(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`)
}

/**
 * @param {{ dev?: boolean; forMeta?: boolean; nonce?: string }} [opts]
 * @returns {string}
 */
export function buildContentSecurityPolicy(opts = {}) {
  const dev = Boolean(opts.dev)
  const forMeta = Boolean(opts.forMeta)
  const nonce = typeof opts.nonce === "string" ? opts.nonce.trim() : ""
  const scriptSrc = ["'self'"]
  if (nonce) {
    scriptSrc.push(`'nonce-${nonce}'`)
  }
  scriptSrc.push("https://*.paypal.com", "https://*.paypalobjects.com")
  if (dev) scriptSrc.push("'unsafe-eval'")

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' https://fonts.googleapis.com https://*.paypal.com https://*.paypalobjects.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://*.supabase.co https://*.paypal.com https://*.paypalobjects.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.paypal.com https://*.paypalobjects.com",
    "frame-src 'self' https://*.paypal.com https://*.paypalobjects.com",
    "child-src 'self' https://*.paypal.com https://*.paypalobjects.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://*.paypal.com",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ]

  if (forMeta) {
    return directives
      .filter((directive) => !META_UNSUPPORTED_DIRECTIVES.has(directive.split(/\s+/)[0]))
      .join("; ")
  }

  return directives.join("; ")
}

/** @param {{ dev?: boolean; nonce?: string; coep?: boolean }} [opts] */
export function buildSecurityHeaders(opts = {}) {
  const headers = {
    "Content-Security-Policy": buildContentSecurityPolicy(opts),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self)",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    // PayPal Smart Buttons open a popup; strict same-origin COOP breaks checkout.
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "Cross-Origin-Resource-Policy": "same-origin",
  }
  // COEP require-corp breaks Supabase storage images and PayPal iframes unless every
  // cross-origin asset sends Cross-Origin-Resource-Policy. Opt in via SECURITY_COEP=1.
  if (opts.coep || process.env.SECURITY_COEP === "1") {
    headers["Cross-Origin-Embedder-Policy"] = "require-corp"
  }
  return headers
}

/** Netlify / Cloudflare Pages `_headers` file body (no per-request nonce; prod build has no inline scripts). */
export function buildHeadersFile(opts = {}) {
  const headers = buildSecurityHeaders(opts)
  const lines = ["/*"]
  for (const [name, value] of Object.entries(headers)) {
    lines.push(`  ${name}: ${value}`)
  }
  lines.push("")
  return lines.join("\n")
}
