import imageCompression from "browser-image-compression"

export type ImageUploadKind = "avatar" | "portfolio"

const PRESETS = {
  avatar: { maxSizeMB: 0.5, maxWidthOrHeight: 400 },
  portfolio: { maxSizeMB: 0.5, maxWidthOrHeight: 1200 },
} as const

/** Compress images client-side before Supabase upload — WebP, size-capped by kind. */
export async function compressImageForUpload(file: File, kind: ImageUploadKind = "portfolio"): Promise<File> {
  const preset = PRESETS[kind]
  return imageCompression(file, {
    maxSizeMB: preset.maxSizeMB,
    maxWidthOrHeight: preset.maxWidthOrHeight,
    useWebWorker: true,
    fileType: "image/webp",
    initialQuality: 0.85,
  })
}
