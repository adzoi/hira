/**
 * Supabase Storage image URLs for display.
 * Always serves the plain /object/public/ URL. The /render/image/ transform endpoint returns 403
 * on this project (Image Transformations not enabled), which broke every avatar and listing image.
 * Uploads are already compressed client-side (compressImageForUpload).
 */

export type AppSupabaseClient = {
  storage: {
    from: (bucket: string) => {
      getPublicUrl: (path: string) => { data?: { publicUrl?: string | null } | null }
    }
  }
}

function isSupabaseStorageUrl(url: string): boolean {
  return (
    url.includes("/storage/v1/object/public/") ||
    url.includes("/storage/v1/render/image/public/")
  )
}

/** Normalize a Supabase object or render URL to the plain public object URL (no transform query). */
export function applyImageTransform(url: string): string {
  const trimmed = url.trim()
  if (!trimmed || !isSupabaseStorageUrl(trimmed)) return trimmed

  return trimmed
    .split("?")[0]!
    .replace("/storage/v1/render/image/public/", "/storage/v1/object/public/")
}

/** Extract object path from a Supabase Storage public object or render URL for `bucket`. */
export function storageObjectPathFromPublicUrl(publicUrl: string, bucket: string): string | null {
  for (const prefix of [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/render/image/public/${bucket}/`,
  ]) {
    const i = publicUrl.indexOf(prefix)
    if (i === -1) continue
    const raw = publicUrl.slice(i + prefix.length).split(/[?#]/)[0] ?? ""
    if (!raw) return null
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return null
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

function displayPublicUrl(
  client: AppSupabaseClient,
  bucket: string,
  path: string,
): string | null {
  const plain = safeGetPublicUrl(client, bucket, path)
  return plain ? applyImageTransform(plain) : null
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
 * External URLs (Gravatar, Twitter, etc.) pass through unchanged.
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

  if (/^https?:\/\//i.test(s) && !isSupabaseStorageUrl(s)) return s

  if (!client) {
    return isSupabaseStorageUrl(s) ? applyImageTransform(s) : s
  }

  const extractedFromPublicUrl = storageObjectPathFromPublicUrl(s, "avatars")
  if (extractedFromPublicUrl != null) {
    const path = stripLeadingAvatarsSegment(extractedFromPublicUrl)
    if (!path) return applyImageTransform(s)
    return displayPublicUrl(client, "avatars", path) ?? applyImageTransform(s)
  }

  if (!/^https?:\/\//i.test(s)) {
    const path = stripLeadingAvatarsSegment(s)
    if (!path) return s
    return displayPublicUrl(client, "avatars", path) ?? s
  }

  return applyImageTransform(s)
}

export function jobImageThumbnailUrl(client: AppSupabaseClient, storagePath: string): string {
  return displayPublicUrl(client, "job-images", storagePath) ?? storagePath
}

export function jobImageDetailUrl(client: AppSupabaseClient, storagePath: string): string {
  return displayPublicUrl(client, "job-images", storagePath) ?? storagePath
}

export function serviceImageThumbnailUrl(client: AppSupabaseClient, storagePath: string): string {
  return displayPublicUrl(client, "service-images", storagePath) ?? storagePath
}

export function serviceImageDetailUrl(client: AppSupabaseClient, storagePath: string): string {
  return displayPublicUrl(client, "service-images", storagePath) ?? storagePath
}

/**
 * Returns a displayable URL for job, service, or other Supabase storage images.
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

  if (/^https?:\/\//i.test(s) && !isSupabaseStorageUrl(s)) return s

  if (!client) {
    return isSupabaseStorageUrl(s) ? applyImageTransform(s) : s
  }

  const jobPath = storageObjectPathFromPublicUrl(s, "job-images")
  if (jobPath) return displayPublicUrl(client, "job-images", jobPath) ?? applyImageTransform(s)

  const servicePath = storageObjectPathFromPublicUrl(s, "service-images")
  if (servicePath) return displayPublicUrl(client, "service-images", servicePath) ?? applyImageTransform(s)

  if (isSupabaseStorageUrl(s)) return applyImageTransform(s)

  return s
}
