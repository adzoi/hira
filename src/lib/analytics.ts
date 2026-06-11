import { COOKIE_CONSENT_EVENT, hasFullCookieConsent } from "./cookieConsent.ts"

/** GA4 Measurement ID — all events and page views must use this property. */
export const GA_MEASUREMENT_ID = "G-HT76VNZHG5"

type Gtag = (...args: unknown[]) => void

let loadScheduled = false
let gtagFn: Gtag | null = null
/** Latest path queued before gtag.js finishes loading (SPA first paint). */
let pendingPagePath: string | null = null
/** Prevents sending the same path twice in a row (e.g. consent + route effect). */
let lastTrackedPagePath: string | null = null

function isProduction(): boolean {
  return import.meta.env.PROD
}

/** True when GA4 may run: production build and user accepted analytics cookies. */
export function isAnalyticsEnabled(): boolean {
  return isProduction() && hasFullCookieConsent()
}

function getPagePath(): string {
  return window.location.pathname + window.location.search + window.location.hash
}

function sendPageView(gtag: Gtag, pagePath: string): void {
  if (pagePath === lastTrackedPagePath) return
  lastTrackedPagePath = pagePath

  gtag("config", GA_MEASUREMENT_ID, {
    page_path: pagePath,
    page_location: `${window.location.origin}${pagePath}`,
    page_title: document.title,
  })
}

function onGtagReady(gtag: Gtag): void {
  gtagFn = gtag
  gtag("js", new Date())
  // Disable automatic first page_view; route tracker sends page views manually.
  gtag("config", GA_MEASUREMENT_ID, { send_page_view: false })

  const path = pendingPagePath ?? getPagePath()
  pendingPagePath = null
  sendPageView(gtag, path)
}

function scheduleGoogleAnalyticsLoad(): void {
  if (loadScheduled || typeof window === "undefined" || !isAnalyticsEnabled()) return
  loadScheduled = true

  const load = () => {
    const script = document.createElement("script")
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
    script.onload = () => {
      window.dataLayer = window.dataLayer ?? []
      const gtag: Gtag = (...args: unknown[]) => {
        window.dataLayer?.push(args)
      }
      onGtagReady(gtag)
    }
    document.head.appendChild(script)
  }

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(load, { timeout: 3000 })
  } else {
    window.addEventListener("load", load, { once: true })
  }
}

/**
 * Initialize GA4 (called once from `src/main.tsx` at app bootstrap).
 * Loads gtag.js only in production after the user accepts all cookies.
 * Page views are tracked separately via `trackPageView` on route changes.
 */
export function initGoogleAnalytics(): void {
  if (!isProduction()) return

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

/**
 * Track a SPA page view. Called automatically on route changes from `App.tsx`.
 * Skips duplicate paths and no-ops in development or without cookie consent.
 */
export function trackPageView(pagePath?: string): void {
  if (!isAnalyticsEnabled()) return

  const path = pagePath ?? getPagePath()
  if (path === lastTrackedPagePath) return

  if (!gtagFn) {
    pendingPagePath = path
    return
  }

  sendPageView(gtagFn, path)
}

/**
 * Track a custom GA4 event.
 *
 * @example
 * import { trackEvent } from "../lib/analytics.ts"
 * trackEvent("sign_up", { method: "email" })
 * trackEvent("purchase", { value: 49.99, currency: "GEL" })
 */
export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | undefined>,
): void {
  if (!isAnalyticsEnabled() || !gtagFn) return

  gtagFn("event", eventName, params)
}
