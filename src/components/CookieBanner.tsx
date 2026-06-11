import { useEffect } from "react"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { hasCookieChoice } from "../lib/cookieConsent.ts"

/** Syncs i18n strings onto the static banner in index.html; UI is not React-rendered. */
export default function CookieBanner() {
  const { t } = useTranslation()

  useEffect(() => {
    const banner = document.getElementById("cookie-banner-static")
    if (!banner) return

    if (hasCookieChoice()) {
      banner.remove()
      document.documentElement.classList.remove("cookie-banner-visible")
      document.documentElement.classList.add("cookie-consent-given")
      return
    }

    const heading = document.getElementById("cookie-banner-heading")
    const message = document.getElementById("cookie-banner-message")
    const learnMore = document.getElementById("cookie-banner-learn-more")
    const essentialBtn = document.getElementById("cookie-banner-essential")
    const acceptBtn = document.getElementById("cookie-banner-accept-all")

    if (heading) heading.textContent = t("cookies.bannerHeading")
    if (message) {
      const link = learnMore
      message.textContent = ""
      message.append(`${t("cookies.bannerMessage")} `)
      if (link) {
        link.textContent = t("cookies.bannerLearnMore")
        message.appendChild(link)
      }
    } else if (learnMore) {
      learnMore.textContent = t("cookies.bannerLearnMore")
    }
    if (essentialBtn) essentialBtn.textContent = t("cookies.bannerEssentialOnly")
    if (acceptBtn) acceptBtn.textContent = t("cookies.bannerAcceptAll")
  }, [t])

  return null
}
