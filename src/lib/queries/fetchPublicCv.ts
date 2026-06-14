import { sanitizeCvProfessionalSummary } from "../cvFromProfile.ts"
import { loadMergedCvForUser, type CvPayload } from "./fetchCvGenerator.ts"
import { supabaseEdgeHeaders } from "../supabaseEdgeHeaders.ts"
import { isSupabaseConfigured, supabase } from "../supabase.ts"

export type { CvPayload }

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

  const savedCv = (payload?.cv ?? null) as Record<string, unknown> | null
  if (!savedCv) return null

  const userId = typeof savedCv.user_id === "string" ? savedCv.user_id.trim() : ""
  if (userId && isSupabaseConfigured && supabase) {
    try {
      return await loadMergedCvForUser(userId, savedCv)
    } catch {
      /* fall through to sanitized saved row */
    }
  }

  return {
    ...savedCv,
    professional_summary: sanitizeCvProfessionalSummary(
      typeof savedCv.professional_summary === "string" ? savedCv.professional_summary : "",
    ),
  } as CvPayload
}
