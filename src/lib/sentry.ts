import * as Sentry from "@sentry/react"
import { isSupabaseConfigured, supabase } from "./supabase.ts"

const DSN = import.meta.env.VITE_SENTRY_DSN?.trim() ?? ""

/** True when a DSN is configured (Sentry runs in all environments when set). */
export function isSentryEnabled(): boolean {
  return Boolean(DSN)
}

function currentRoutePath(): string {
  if (typeof window === "undefined") return "/"
  return window.location.pathname + window.location.search + window.location.hash
}

async function syncSentryUserTags(): Promise<void> {
  if (!isSentryEnabled() || !isSupabaseConfigured || !supabase) {
    Sentry.setTag("user_type", "anonymous")
    return
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    Sentry.setUser(null)
    Sentry.setTag("user_type", "anonymous")
    return
  }

  Sentry.setUser({ id: session.user.id })

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("id", session.user.id)
    .maybeSingle()

  const userType = profile?.user_type
  Sentry.setTag(
    "user_type",
    userType === "freelancer" || userType === "hirer" ? userType : "unknown",
  )
}

function initSentryAuthTags(): void {
  if (!isSupabaseConfigured || !supabase) return

  void syncSentryUserTags()
  supabase.auth.onAuthStateChange(() => {
    void syncSentryUserTags()
  })
}

/** Initialize Sentry (call once from `src/main.tsx` before rendering). */
export function initSentry(): void {
  if (!isSentryEnabled()) return

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0,
  })

  Sentry.setTag("route", currentRoutePath())
  initSentryAuthTags()
}

/** Keep the current SPA route on the Sentry scope (call on each navigation). */
export function syncSentryRoute(pagePath?: string): void {
  if (!isSentryEnabled()) return
  Sentry.setTag("route", pagePath ?? currentRoutePath())
}

/**
 * Deliberate test error — enable with `VITE_SENTRY_TEST_ERROR=1`, then reload any page.
 * Remove the flag after confirming events in the Sentry dashboard.
 */
export function triggerSentryTestErrorIfEnabled(): void {
  if (import.meta.env.VITE_SENTRY_TEST_ERROR !== "1") return
  throw new Error("[Sentry test] deliberate frontend error")
}

export { Sentry }
