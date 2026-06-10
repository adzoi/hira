import { COOKIE_CONSENT_EVENT, hasFullCookieConsent } from "./cookieConsent.ts"

const GA_MEASUREMENT_ID = "G-HT76VNZHG5"

let loadScheduled = false

function scheduleGoogleAnalyticsLoad(): void {
  if (loadScheduled || typeof window === "undefined") return
  loadScheduled = true

  const load = () => {
    const script = document.createElement("script")
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
    script.onload = () => {
      window.dataLayer = window.dataLayer ?? []
      const gtag = (...args: unknown[]) => {
        window.dataLayer?.push(args)
      }
      gtag("js", new Date())
      gtag("config", GA_MEASUREMENT_ID)
    }
    document.head.appendChild(script)
  }

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(load, { timeout: 3000 })
  } else {
    window.addEventListener("load", load, { once: true })
  }
}

/** Load GA4 after idle time; only when the user accepted all cookies. */
export function initGoogleAnalytics(): void {
  if (hasFullCookieConsent()) {
    scheduleGoogleAnalyticsLoad()
    return
  }

  window.addEventListener(
    COOKIE_CONSENT_EVENT,
    () => {
      if (hasFullCookieConsent()) scheduleGoogleAnalyticsLoad()
    },
    { passive: true },
  )
}
