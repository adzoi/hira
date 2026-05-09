/**
 * storageImageUrl.ts
 *
 * NOTE: Supabase image transformation (/render/image/public/) requires Pro plan.
 * This file serves plain public URLs only — no transforms applied.
 *
 * If a URL was previously saved to the DB as a /render/image/public/ URL,
 * it is converted back to the plain /storage/v1/object/public/ equivalent.
 */

export type AppSupabaseClient = {
  storage: {
    from: (bucket: string) => {
      getPublicUrl: (path: string) => { data?: { publicUrl?: string | null } | null }
    }
  }
}

/**
 * If a URL was saved as a Supabase render/transform URL, convert it back to
 * a plain object URL so it actually loads on the free tier.
 * e.g. /storage/v1/render/image/public/avatars/x.jpg?width=80...
 *   → /storage/v1/object/public/avatars/x.jpg
 */
function normalizeSupabaseUrl(url: string): string {
  if (!url.includes("/storage/v1/render/image/public/")) return url
  const withoutQuery = url.split("?")[0]!
  return withoutQuery.replace("/storage/v1/render/image/public/", "/storage/v1/object/public/")
}

/** Extract object path from a Supabase Storage public object URL for `bucket`. */
export function storageObjectPathFromPublicUrl(publicUrl: string, bucket: string): string | null {
  const needle = `/storage/v1/object/public/${bucket}/`
  const i = publicUrl.indexOf(needle)
  if (i === -1) return null
  const raw = publicUrl.slice(i + needle.length).split(/[?#]/)[0] ?? ""
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function stripLeadingAvatarsSegment(path: string): string {
  return path.replace(/^\/?avatars\//i, "").replace(/^\//, "")
}

function safeGetPublicUrl(
  client: AppSupabaseClient,
  bucket: string,
  path: string,
): string | null {
  if (!path) return null
  try {
    return client.storage.from(bucket).getPublicUrl(path).data?.publicUrl ?? null
  } catch {
    return null
  }
}

/** Storage path → plain public URL (avatars bucket, no transform). */
export function avatarPublicUrl(client: AppSupabaseClient, storagePath: string): string {
  let path = storagePath.trim()
  if (!path) return ""
  path = stripLeadingAvatarsSegment(path)
  if (!path) return ""
  return safeGetPublicUrl(client, "avatars", path) ?? storagePath
}

/**
 * Returns a displayable URL for a profile avatar.
 * - /render/ URLs saved in DB are converted to plain /object/ URLs
 * - External URLs (Gravatar, Twitter, etc.) pass through unchanged
 * - blob:/data: URLs pass through unchanged
 */
export function avatarImageUrl(
  client: AppSupabaseClient | null | undefined,
  src: string | null | undefined,
): string | null {
  if (src == null) return null
  const s = String(src).trim()
  if (!s) return null

  const lower = s.toLowerCase()
  if (lower.startsWith("blob:") || lower.startsWith("data:")) return s

  // Fix render URLs saved in DB → convert to plain object URL
  if (s.includes("/storage/v1/render/image/public/")) return normalizeSupabaseUrl(s)

  // External non-Supabase URL → pass through
  if (/^https?:\/\//i.test(s) && !s.includes("/storage/v1/object/public/avatars/")) return s

  // No client → return as-is
  if (!client) return s

  // Full plain Supabase storage URL → extract path and get clean public URL
  const extractedFromPublicUrl = storageObjectPathFromPublicUrl(s, "avatars")
  if (extractedFromPublicUrl != null) {
    const path = stripLeadingAvatarsSegment(extractedFromPublicUrl)
    if (!path) return s
    return safeGetPublicUrl(client, "avatars", path) ?? s
  }

  // Raw in-bucket object path saved in DB (e.g. `${userId}/avatar.jpg`)
  if (!/^https?:\/\//i.test(s)) {
    const path = stripLeadingAvatarsSegment(s)
    if (!path) return s
    return safeGetPublicUrl(client, "avatars", path) ?? s
  }

  return s
}

export function jobImageThumbnailUrl(client: AppSupabaseClient, storagePath: string): string {
  return safeGetPublicUrl(client, "job-images", storagePath) ?? storagePath
}

export function jobImageDetailUrl(client: AppSupabaseClient, storagePath: string): string {
  return safeGetPublicUrl(client, "job-images", storagePath) ?? storagePath
}

export function serviceImageThumbnailUrl(client: AppSupabaseClient, storagePath: string): string {
  return safeGetPublicUrl(client, "service-images", storagePath) ?? storagePath
}

export function serviceImageDetailUrl(client: AppSupabaseClient, storagePath: string): string {
  return safeGetPublicUrl(client, "service-images", storagePath) ?? storagePath
}

/**
 * Returns a displayable URL for job or service images.
 * No transforms applied — plain public URLs only.
 */
export function jobOrServiceImageDisplayUrl(
  client: AppSupabaseClient | null | undefined,
  src: string | null | undefined,
  _size: "thumbnail" | "detail", // kept for API compatibility, ignored
): string | null {
  if (src == null) return null
  const s = String(src).trim()
  if (!s) return null

  const lower = s.toLowerCase()
  if (lower.startsWith("blob:") || lower.startsWith("data:")) return s

  // Fix render URLs saved in DB
  if (s.includes("/storage/v1/render/image/public/")) return normalizeSupabaseUrl(s)

  // External non-Supabase URL
  if (
    /^https?:\/\//i.test(s) &&
    !s.includes("/storage/v1/object/public/job-images/") &&
    !s.includes("/storage/v1/object/public/service-images/")
  ) {
    return s
  }

  if (!client) return s

  const jobPath = storageObjectPathFromPublicUrl(s, "job-images")
  if (jobPath) return jobImageThumbnailUrl(client, jobPath)

  const servicePath = storageObjectPathFromPublicUrl(s, "service-images")
  if (servicePath) return serviceImageThumbnailUrl(client, servicePath)

  return s
}