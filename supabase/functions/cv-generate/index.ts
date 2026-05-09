const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

/**
 * CV generation was removed: the app builds CV from profile data client-side.
 * This endpoint remains as a clear 410 for legacy clients.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders })
  return jsonResponse(
    {
      errors: [
        "AI CV generation is disabled. Open /cv-generator to build your CV from your profile.",
      ],
    },
    410,
  )
})
