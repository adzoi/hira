declare const Deno: {
  env: { get: (key: string) => string | undefined }
}

const FALLBACK_ORIGINS = [
  "https://gigori-production.up.railway.app",
  "http://localhost:5173",
  "http://localhost:3000",
]

function allowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? Deno.env.get("PUBLIC_SITE_URL") ?? ""
  const configured = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  if (configured.length === 0) return FALLBACK_ORIGINS
  return [...new Set([...configured, ...FALLBACK_ORIGINS])]
}

/** Reflect request Origin when it matches the allowlist; otherwise use first allowed origin. */
export function resolveAllowedOrigin(req: Request): string {
  const allowlist = allowedOrigins()
  const origin = req.headers.get("Origin") ?? ""
  if (origin && allowlist.includes(origin)) return origin
  return allowlist[0] ?? "*"
}

export function corsHeadersFor(
  req: Request,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(req),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-gigori-webhook-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...extra,
  }
}
