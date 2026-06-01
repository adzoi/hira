import { supabaseEdgeHeaders } from "../supabaseEdgeHeaders.ts"
import { supabase } from "../supabase.ts"

export type CvPayload = Record<string, unknown>

export async function fetchPublicCvBySlug(slug: string): Promise<CvPayload | null> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cv-get?slug=${encodeURIComponent(slug)}`,
    {
      method: "GET",
      headers: supabaseEdgeHeaders(token),
    },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "CV ვერ მოიძებნა.")
  }
  return (payload?.cv ?? null) as CvPayload | null
}
