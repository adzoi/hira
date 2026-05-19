/** Shared security headers for production static server, Vite preview, and build output. */

/** Directives that must be sent via HTTP headers, not `<meta http-equiv="Content-Security-Policy">`. */
const META_UNSUPPORTED_DIRECTIVES = new Set(["frame-ancestors"])

/**
 * @param {{ dev?: boolean; forMeta?: boolean }} [opts]
 * @returns {string}
 */
export function buildContentSecurityPolicy(opts = {}) {
  const dev = Boolean(opts.dev)
  const forMeta = Boolean(opts.forMeta)
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "https://*.paypal.com",
    "https://*.paypalobjects.com",
  ]
  if (dev) scriptSrc.push("'unsafe-eval'")

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.paypal.com https://*.paypalobjects.com",
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

/** @param {{ dev?: boolean }} [opts] */
export function buildSecurityHeaders(opts = {}) {
  return {
    "Content-Security-Policy": buildContentSecurityPolicy(opts),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  }
}

/** Netlify / Cloudflare Pages `_headers` file body. */
export function buildHeadersFile(opts = {}) {
  const headers = buildSecurityHeaders(opts)
  const lines = ["/*"]
  for (const [name, value] of Object.entries(headers)) {
    lines.push(`  ${name}: ${value}`)
  }
  lines.push("")
  return lines.join("\n")
}
