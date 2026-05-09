/** Headers Supabase Edge Functions expect: anon apikey + optional user JWT. */
export function supabaseEdgeHeaders(accessToken?: string | null): Record<string, string> {
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""
  const headers: Record<string, string> = {
    apikey: anon,
    "Content-Type": "application/json",
  }
  const token = typeof accessToken === "string" ? accessToken.trim() : ""
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}
