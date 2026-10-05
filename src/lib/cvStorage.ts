import type { SupabaseClient } from "@supabase/supabase-js"

/** Uploaded CVs live in the private `cvs` bucket at `{userId}/cv.pdf`; `profiles.cv_url` only flags that one exists. */
export function cvStoragePath(userId: string): string {
  return `${userId}/cv.pdf`
}

const CV_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60

/** Signed download link, or null when the viewer is not allowed to read the CV (storage RLS). */
export async function createCvSignedUrl(client: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await client.storage.from("cvs").createSignedUrl(cvStoragePath(userId), CV_SIGNED_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
