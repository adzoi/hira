import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import I18nText from "../i18n/I18nText.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import {
  acceptAllCookies,
  acceptEssentialCookies,
  hasCookieChoice,
} from "../lib/cookieConsent.ts"

export default function CookieBanner() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(!hasCookieChoice())
  }, [])

  if (!visible) return null

  const handleAcceptAll = () => {
    acceptAllCookies()
    window.location.reload()
  }

  const handleEssentialOnly = () => {
    acceptEssentialCookies()
    window.location.reload()
  }

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-banner-heading"
      aria-describedby="cookie-banner-message"
      className="fixed inset-x-0 bottom-0 z-[90] animate-[slideInUp_0.3s_ease] border-t border-slate-200 bg-white px-4 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p id="cookie-banner-heading" className="text-sm font-semibold text-slate-800">
            <I18nText i18nKey="cookies.bannerHeading" />
          </p>
          <p id="cookie-banner-message" className="mt-1 text-sm text-slate-600">
            <I18nText i18nKey="cookies.bannerMessage" />{" "}
            <Link
              to="/cookies"
              className="font-medium text-brand underline-offset-2 hover:underline"
            >
              {t("cookies.bannerLearnMore")}
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleEssentialOnly}
            className="h-11 rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-50"
          >
            <I18nText i18nKey="cookies.bannerEssentialOnly" />
          </button>
          <button
            type="button"
            onClick={handleAcceptAll}
            className="h-11 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-hover"
          >
            <I18nText i18nKey="cookies.bannerAcceptAll" />
          </button>
        </div>
      </div>
    </div>
  )
}
