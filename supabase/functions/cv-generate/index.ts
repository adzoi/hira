import { enforceRateLimit } from "../_shared/rateLimit.ts"
import { corsHeadersFor } from "../_shared/cors.ts"
import { serveWithSentry } from "../_shared/sentry.ts"

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeadersFor(req) })
}

/**
 * CV generation was removed: the app builds CV from profile data client-side.
 * This endpoint remains as a clear 410 for legacy clients.
 */
serveWithSentry("cv-generate", async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeadersFor(req) })

  const rateLimited = await enforceRateLimit(
    req,
    { prefix: "rl:cv-generate", requests: 10, window: "1 m" },
    corsHeadersFor(req),
  )
  if (rateLimited) return rateLimited

  return jsonResponse(req, 
    {
      errors: [
        "AI CV generation is disabled. Open /cv-generator to build your CV from your profile.",
      ],
    },
    410,
  )
})
