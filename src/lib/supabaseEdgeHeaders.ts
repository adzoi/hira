/** Headers Supabase Edge Functions expect: anon apikey + JWT (user session or anon key). */
export function supabaseEdgeHeaders(accessToken?: string | null): Record<string, string> {
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""
  const headers: Record<string, string> = {
    apikey: anon,
    "Content-Type": "application/json",
  }
  const token = typeof accessToken === "string" ? accessToken.trim() : ""
  headers.Authorization = `Bearer ${token || anon}`
  return headers
}
