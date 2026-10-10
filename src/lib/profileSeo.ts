/** Keep in sync with seo/shareMeta.mjs and supabase/functions/sitemap/index.ts. */
export const MIN_PROFILE_BIO_CHARS = 60
export const MIN_PROFILE_SKILLS = 3

/** A profile is worth indexing with a real bio, a few skills, or at least one review. */
export function isSubstantiveProfile(input: { bio?: string | null; skillCount: number; reviewCount: number }): boolean {
  const bio = (input.bio ?? "").replace(/\s+/g, " ").trim()
  return bio.length >= MIN_PROFILE_BIO_CHARS || input.skillCount >= MIN_PROFILE_SKILLS || input.reviewCount > 0
}
