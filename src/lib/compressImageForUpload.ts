export type ImageUploadKind = "avatar" | "portfolio" | "chat"

const PRESETS = {
  avatar: { maxSizeMB: 0.5, maxWidthOrHeight: 400, fileType: "image/webp" as const },
  portfolio: { maxSizeMB: 0.5, maxWidthOrHeight: 1200, fileType: "image/webp" as const },
  /** Keep original mime (png/jpeg) so chat-attachments bucket allow-list still matches. */
  chat: { maxSizeMB: 2, maxWidthOrHeight: 1920, fileType: undefined },
} as const

/** Compress images client-side before Supabase upload — WebP for avatars/portfolio; original type for chat. */
export async function compressImageForUpload(file: File, kind: ImageUploadKind = "portfolio"): Promise<File> {
  const preset = PRESETS[kind]
  // Loaded on demand so the library stays out of the initial bundle.
  const { default: imageCompression } = await import("browser-image-compression")
  return imageCompression(file, {
    maxSizeMB: preset.maxSizeMB,
    maxWidthOrHeight: preset.maxWidthOrHeight,
    useWebWorker: true,
    ...(preset.fileType ? { fileType: preset.fileType } : {}),
    initialQuality: 0.85,
  })
}
