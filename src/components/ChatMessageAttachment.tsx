import { useEffect, useState } from "react"
import {
  formatChatAttachmentSize,
  getChatAttachmentSignedUrl,
  isChatImageAttachment,
} from "../lib/chatAttachments.ts"
import { supabase } from "../lib/supabase.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"

type Props = {
  path: string
  name: string | null
  mimeType: string | null
  sizeBytes: number | null
  isOwn: boolean
}

export default function ChatMessageAttachment({ path, name, mimeType, sizeBytes, isOwn }: Props) {
  const { t } = useTranslation()
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const isImage = isChatImageAttachment(mimeType)
  const displayName = name?.trim() || t("messages.attachmentFile")
  const sizeLabel = sizeBytes != null ? formatChatAttachmentSize(sizeBytes) : ""

  useEffect(() => {
    if (!isImage || !supabase || !path) return
    let cancelled = false
    void getChatAttachmentSignedUrl(supabase, path)
      .then((url) => {
        if (!cancelled) setThumbUrl(url)
      })
      .catch(() => {
        if (!cancelled) setThumbUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [isImage, path])

  const openSigned = async () => {
    if (!supabase || busy) return
    setBusy(true)
    setError("")
    try {
      const url = await getChatAttachmentSignedUrl(supabase, path)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (e) {
      setError(e instanceof Error ? e.message : t("messages.attachmentOpenFailed"))
    } finally {
      setBusy(false)
    }
  }

  if (isImage) {
    return (
      <div className="mt-1.5">
        <button
          type="button"
          onClick={() => void openSigned()}
          disabled={busy}
          className="block overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          aria-label={t("messages.openAttachment")}
        >
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={displayName}
              className="max-h-48 max-w-full rounded-lg object-cover"
            />
          ) : (
            <span
              className={`flex h-28 w-40 items-center justify-center rounded-lg text-xs ${
                isOwn ? "bg-white/15 text-white/80" : "bg-slate-100 text-slate-500"
              }`}
            >
              {busy ? "…" : t("messages.attachmentImage")}
            </span>
          )}
        </button>
        {error ? <p className={`mt-1 text-[10px] ${isOwn ? "text-white/80" : "text-red-500"}`}>{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => void openSigned()}
        disabled={busy}
        className={`flex w-full max-w-xs items-center gap-2 rounded-xl px-3 py-2 text-left text-xs transition ${
          isOwn
            ? "bg-white/15 text-white hover:bg-white/25"
            : "border border-slate-200 bg-slate-50 text-[#1B2B4B] hover:bg-slate-100"
        }`}
        aria-label={t("messages.downloadAttachment")}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{displayName}</span>
          {sizeLabel ? (
            <span className={`block ${isOwn ? "text-white/70" : "text-slate-500"}`}>{sizeLabel}</span>
          ) : null}
        </span>
        <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0" fill="currentColor">
          <path d="M12 3a1 1 0 0 1 1 1v9.6l2.3-2.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L11 13.6V4a1 1 0 0 1 1-1Zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z" />
        </svg>
      </button>
      {error ? <p className={`mt-1 text-[10px] ${isOwn ? "text-white/80" : "text-red-500"}`}>{error}</p> : null}
    </div>
  )
}
