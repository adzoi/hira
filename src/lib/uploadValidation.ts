export const UPLOAD_LIMITS = {
  avatarMaxBytes: 5 * 1024 * 1024,
  cvMaxBytes: 10 * 1024 * 1024,
  imageMaxBytes: 5 * 1024 * 1024,
  avatarMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  cvMimeTypes: ["application/pdf"] as const,
} as const

export type UploadValidationResult = { ok: true } | { ok: false; message: string }

export function validateAvatarUpload(file: File): UploadValidationResult {
  if (file.size > UPLOAD_LIMITS.avatarMaxBytes) {
    return { ok: false, message: "სურათის ზომა არ უნდა აღემატებოდეს 5MB-ს." }
  }
  if (!(UPLOAD_LIMITS.avatarMimeTypes as readonly string[]).includes(file.type)) {
    return { ok: false, message: "მხოლოდ JPEG, PNG ან WebP ფორმატები დაიშვება." }
  }
  return { ok: true }
}

export function validateCvUpload(file: File): UploadValidationResult {
  if (file.size > UPLOAD_LIMITS.cvMaxBytes) {
    return { ok: false, message: "PDF ფაილი არ უნდა აღემატებოდეს 10MB-ს." }
  }
  if (!(UPLOAD_LIMITS.cvMimeTypes as readonly string[]).includes(file.type)) {
    return { ok: false, message: "მხოლოდ PDF ფორმატი დაიშვება." }
  }
  return { ok: true }
}

export function validateImageUpload(file: File): UploadValidationResult {
  if (file.size > UPLOAD_LIMITS.imageMaxBytes) {
    return { ok: false, message: "სურათის ზომა არ უნდა აღემატებოდეს 5MB-ს." }
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, message: "მხოლოდ სურათის ფაილი დაიშვება." }
  }
  return { ok: true }
}
