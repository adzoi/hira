import { useEffect, useState } from "react"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { FacebookBrandIcon } from "./SocialBrandIcons.tsx"

type FacebookGroupPostButtonProps = {
  /** Absolute URL; gets UTM tags so visits from groups show up in analytics. */
  url: string
  /** Builds the ready-to-paste post body around the tagged URL. */
  buildText: (taggedUrl: string) => string
  className?: string
}

/**
 * Facebook has no "share to group" URL, so we hand the user a pre-formatted
 * post to paste and open the sharer (its "Share to a group" option shows the OG card).
 */
export default function FacebookGroupPostButton({ url, buildText, className }: FacebookGroupPostButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const text = buildText(url)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt(t("share.copyPrompt"), text)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full border border-[#1877F2] bg-[#1877F2]/5 px-3 text-sm font-medium text-[#1877F2] transition hover:bg-[#1877F2]/10 ${className ?? ""}`}
      >
        <FacebookBrandIcon className="h-4 w-4" /> {t("share.groupPost")}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fb-group-post-title"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 id="fb-group-post-title" className="text-lg font-bold text-[#1B2B4B]">
              {t("share.groupPost")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{t("share.groupPostHint")}</p>
            <pre className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-3 font-sans text-sm text-slate-800">
              {text}
            </pre>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t("share.close")}
              </button>
              <button
                type="button"
                onClick={() => void copy()}
                className="rounded-lg border border-[#1877F2] px-4 py-2 text-sm font-semibold text-[#1877F2] hover:bg-[#1877F2]/5"
              >
                {copied ? `✓ ${t("share.textCopied")}` : t("share.copyText")}
              </button>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => void copy()}
                className="rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#166FE5]"
              >
                {t("share.openFacebook")}
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
