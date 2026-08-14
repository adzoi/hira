import type { SupabaseClient } from "@supabase/supabase-js"
import { compressImageForUpload } from "./compressImageForUpload.ts"
import {
  assertField,
  LIMITS,
  sanitizeChatAttachmentFilename,
  validateChatAttachment,
} from "./validation.ts"

export const CHAT_ATTACHMENTS_BUCKET = "chat-attachments"
export const CHAT_ATTACHMENT_SIGNED_URL_TTL_SECONDS = 300

export type ChatAttachmentMeta = {
  url: string
  name: string
  type: string
  sizeBytes: number
}

/** Fresh signed URL for a private chat-attachments object path. */
export async function getChatAttachmentSignedUrl(
  client: SupabaseClient,
  path: string,
  expiresInSeconds = CHAT_ATTACHMENT_SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const trimmed = path.trim()
  if (!trimmed) throw new Error("Missing attachment path")

  const { data, error } = await client.storage
    .from(CHAT_ATTACHMENTS_BUCKET)
    .createSignedUrl(trimmed, expiresInSeconds)

  if (error || !data?.signedUrl) {
    throw error ?? new Error("Could not create signed URL")
  }
  return data.signedUrl
}

export function isChatImageAttachment(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false
  return mimeType === "image/png" || mimeType === "image/jpeg"
}

export function formatChatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function chatAttachmentStoragePath(
  conversationId: string,
  messageId: string,
  filename: string,
): string {
  return `${conversationId}/${messageId}/${sanitizeChatAttachmentFilename(filename)}`
}

/**
 * Validates, optionally compresses (images only), and uploads a chat attachment.
 * Returns metadata to store on the messages row (path, not a signed URL).
 * Does not insert a message row.
 */
export async function uploadChatAttachment(
  client: SupabaseClient,
  opts: {
    conversationId: string
    messageId: string
    file: File
    onProgress?: (ratio: number) => void
  },
): Promise<ChatAttachmentMeta> {
  const validated = assertField(validateChatAttachment(opts.file))
  const isImage = isChatImageAttachment(validated.type)

  let uploadFile: File = validated
  if (isImage) {
    try {
      uploadFile = await compressImageForUpload(validated, "chat")
    } catch (e) {
      console.warn("[chat] image compress failed, uploading original:", e instanceof Error ? e.message : e)
      uploadFile = validated
    }
  }

  if (uploadFile.size > LIMITS.chatAttachmentMaxBytes) {
    throw new Error(`File must be at most ${LIMITS.chatAttachmentMaxMb}MB.`)
  }

  const safeName = sanitizeChatAttachmentFilename(validated.name)
  const path = chatAttachmentStoragePath(opts.conversationId, opts.messageId, safeName)
  opts.onProgress?.(0.05)

  const { error } = await client.storage.from(CHAT_ATTACHMENTS_BUCKET).upload(path, uploadFile, {
    upsert: false,
    contentType: uploadFile.type || validated.type,
  })

  if (error) throw error
  opts.onProgress?.(1)

  return {
    url: path,
    name: safeName,
    type: uploadFile.type || validated.type,
    sizeBytes: uploadFile.size,
  }
}

/** Best-effort cleanup when message insert fails after a successful upload. */
export async function removeChatAttachment(client: SupabaseClient, path: string): Promise<void> {
  const trimmed = path.trim()
  if (!trimmed) return
  const { error } = await client.storage.from(CHAT_ATTACHMENTS_BUCKET).remove([trimmed])
  if (error) console.warn("[chat] remove attachment:", error.message)
}
