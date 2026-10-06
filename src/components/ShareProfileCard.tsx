import { useState } from "react"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { SITE_BASE_URL } from "../lib/usePageMeta.tsx"
import ShareButtons from "./ShareButtons.tsx"

type BadgeLang = "ka" | "en"

const BADGE_SIZE: Record<BadgeLang, { width: number; alt: string }> = {
  ka: { width: 168, alt: "დამიქირავე ჰირაზე" },
  en: { width: 150, alt: "Hire me on Hira" },
}

/** Dashboard card: share the public profile and copy the "Hire me on Hira" badge embed code. */
export default function ShareProfileCard({ slug }: { slug: string }) {
  const { t, locale } = useTranslation()
  const [badgeLang, setBadgeLang] = useState<BadgeLang>(locale === "en" ? "en" : "ka")
  const [copied, setCopied] = useState(false)

  const profileUrl = `${SITE_BASE_URL}/freelancer/${encodeURIComponent(slug)}`
  const badgeSrc = `${SITE_BASE_URL}/badges/hire-me-on-hira-${badgeLang}.svg`
  const { width, alt } = BADGE_SIZE[badgeLang]
  const embedCode = `<a href="${profileUrl}?utm_source=badge" target="_blank" rel="noopener"><img src="${badgeSrc}" alt="${alt}" width="${width}" height="56"></a>`

  const copyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt(t("share.copyPrompt"), embedCode)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-[#1B2B4B]">{t("share.profileHeading")}</h3>
      <p className="mt-1 text-sm text-slate-600">{t("share.profileHint")}</p>
      <ShareButtons url={profileUrl} text={t("share.profileText")} className="mt-4" />

      <div className="mt-6 border-t border-slate-200 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="font-semibold text-[#1B2B4B]">{t("share.badgeHeading")}</h4>
          <div className="inline-flex rounded-full border border-slate-300 p-0.5 text-xs font-semibold">
            {(["ka", "en"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setBadgeLang(lang)}
                className={`rounded-full px-3 py-1 ${badgeLang === lang ? "bg-[#1B2B4B] text-white" : "text-slate-600"}`}
              >
                {lang === "ka" ? "ქართ" : "ENG"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-600">{t("share.badgeHint")}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <img src={`/badges/hire-me-on-hira-${badgeLang}.svg`} alt={alt} width={width} height={56} />
          <button
            type="button"
            onClick={() => void copyEmbed()}
            className="inline-flex h-10 items-center rounded-full bg-[#1B2B4B] px-4 text-sm font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]"
          >
            {copied ? `✓ ${t("share.copied")}` : t("share.copyEmbed")}
          </button>
        </div>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          {embedCode}
        </pre>
      </div>
    </div>
  )
}
