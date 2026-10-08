import { useState } from "react"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { FacebookBrandIcon } from "./SocialBrandIcons.tsx"
import FacebookGroupPostButton from "./FacebookGroupPostButton.tsx"
import { withGroupUtm } from "../lib/groupPost.ts"

type ShareButtonsProps = {
  /** Absolute URL to share. */
  url: string
  /** Short text that accompanies the link in messengers. */
  text: string
  className?: string
  /** Adds a "Post to a Facebook group" button with a ready-to-paste post. */
  groupPost?: {
    campaign: string
    buildText: (taggedUrl: string) => string
  }
}

const linkClass =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-[#0088FF] hover:text-[#0088FF]"

/** Share row: native share sheet on phones (covers Instagram), plus Facebook, Messenger apps and copy. */
export default function ShareButtons({ url, text, className, groupPost }: ShareButtonsProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function"
  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(text)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt(t("share.copyPrompt"), url)
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      {groupPost ? (
        <FacebookGroupPostButton url={withGroupUtm(url, groupPost.campaign)} buildText={groupPost.buildText} />
      ) : null}
      {canNativeShare ? (
        <button
          type="button"
          className={linkClass}
          onClick={() => {
            navigator.share({ url, text }).catch(() => {})
          }}
        >
          ↗ {t("share.share")}
        </button>
      ) : null}
      <a
        className={linkClass}
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <FacebookBrandIcon className="h-4 w-4" /> Facebook
      </a>
      <a className={linkClass} href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`} target="_blank" rel="noopener noreferrer">
        Telegram
      </a>
      <a className={linkClass} href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer">
        WhatsApp
      </a>
      <a className={linkClass} href={`viber://forward?text=${encodeURIComponent(`${text} ${url}`)}`}>
        Viber
      </a>
      <button type="button" className={linkClass} onClick={() => void copy()}>
        {copied ? `✓ ${t("share.copied")}` : t("share.copyLink")}
      </button>
    </div>
  )
}
