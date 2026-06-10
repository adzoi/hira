import type { AuthError, Session, SupabaseClient, User } from "@supabase/supabase-js"
import type { QueryClient } from "@tanstack/react-query"
import { SITE_BASE_URL } from "./usePageMeta.tsx"

/** True when the browser holds a session the auth server no longer accepts. */
export function isStaleAuthSessionError(error: AuthError | null | undefined): boolean {
  if (!error) return false
  const msg = error.message.toLowerCase()
  return (
    msg.includes("refresh token") ||
    msg.includes("invalid jwt") ||
    msg.includes("jwt expired") ||
    error.status === 401
  )
}

/** PostgREST rejects requests when the attached user JWT cannot be verified. */
export function isRejectedJwtPostgrestError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST301"
}

/** Drop invalid local auth so public API calls use the anon key again. */
export async function clearStaleAuthSession(client: SupabaseClient): Promise<void> {
  await client.auth.signOut({ scope: "local" }).catch(() => {})
}

/** Retry a Supabase call once after clearing a rejected browser JWT. */
export async function withRejectedJwtRetry<T extends { error: { code?: string } | null }>(
  client: SupabaseClient,
  fn: () => PromiseLike<T>,
): Promise<T> {
  let result = await fn()
  if (isRejectedJwtPostgrestError(result.error)) {
    await clearStaleAuthSession(client)
    result = await fn()
  }
  return result
}

/**
 * On startup (or after a failed refresh), remove dead sessions from localStorage.
 * Does not weaken server-side auth — only stops sending rejected JWTs on public pages.
 */
export async function recoverFromStaleAuthSession(client: SupabaseClient): Promise<void> {
  const {
    data: { session },
  } = await client.auth.getSession()
  if (!session) return

  const { error } = await client.auth.getUser()
  if (error && isStaleAuthSessionError(error)) {
    await clearStaleAuthSession(client)
  }
}

let authRecoveryStarted = false

const AUTH_HASH_PARAM_KEYS = ["access_token", "refresh_token", "type", "error", "error_description"] as const

export const AUTH_RECOVERY_HINT_KEY = "hira-auth-recovery"
export const AUTH_ONBOARDING_PATH = "/onboarding"
export const AUTH_ONBOARDING_URL = `${SITE_BASE_URL}${AUTH_ONBOARDING_PATH}`

const EMAIL_CONFIRMATION_TYPES = new Set(["signup", "email", "email_change", "invite"])

/** Redirect target for Supabase email confirmation links (`signUp` / resend). */
export function authEmailConfirmRedirectUrl(): string {
  return AUTH_ONBOARDING_URL
}

function isEmailConfirmationType(type: string | null): boolean {
  return type != null && EMAIL_CONFIRMATION_TYPES.has(type)
}

function allowedRedirectOrigin(origin: string): boolean {
  if (typeof window === "undefined") return origin === SITE_BASE_URL
  return origin === SITE_BASE_URL || origin === window.location.origin
}

/** Parse Supabase `redirect_to` query param into a same-site path (and optional search). */
export function parseSupabaseRedirectTo(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null
  let decoded = raw.trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    return null
  }
  // Ignore accidental hash fragments (e.g. trailing `#` from implicit-flow cleanup).
  decoded = decoded.replace(/#.*$/, "")

  if (decoded.startsWith("/") && !decoded.startsWith("//")) {
    return decoded
  }

  try {
    const url = new URL(decoded)
    if (!allowedRedirectOrigin(url.origin)) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

function resolvePostAuthPathname(type: string | null): string {
  if (!isEmailConfirmationType(type) || window.location.pathname === AUTH_ONBOARDING_PATH) {
    return window.location.pathname
  }

  const redirectTo = new URLSearchParams(window.location.search).get("redirect_to")
  const parsed = parseSupabaseRedirectTo(redirectTo)
  if (parsed) return parsed.split("?")[0] || AUTH_ONBOARDING_PATH

  return AUTH_ONBOARDING_PATH
}

function stripBareHashFromUrl(): void {
  if (typeof window === "undefined" || window.location.hash !== "#") return
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
}

/** After Supabase auth, follow `redirect_to` when the SDK routed through Site URL. */
export async function consumeSupabaseAuthRedirect(client: SupabaseClient): Promise<void> {
  if (typeof window === "undefined") return

  stripBareHashFromUrl()

  const searchParams = new URLSearchParams(window.location.search)
  const redirectToRaw = searchParams.get("redirect_to")
  if (!redirectToRaw) return

  const destination = parseSupabaseRedirectTo(redirectToRaw)
  if (!destination) {
    searchParams.delete("redirect_to")
    const cleanedSearch = searchParams.toString()
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${cleanedSearch ? `?${cleanedSearch}` : ""}`,
    )
    return
  }

  const {
    data: { session },
  } = await client.auth.getSession()
  if (!session) return

  const current = `${window.location.pathname}${window.location.search}`
  if (current === destination) {
    window.history.replaceState(null, "", destination)
    return
  }

  const destUrl = destination.startsWith("http")
    ? destination
    : `${window.location.origin}${destination}`

  window.location.replace(destUrl)
}

/** True when the URL hash looks like a Supabase auth redirect (implicit / recovery flow). */
export function urlHasAuthHash(): boolean {
  if (typeof window === "undefined") return false
  const hash = window.location.hash.replace(/^#/, "")
  if (!hash) return false
  const params = new URLSearchParams(hash)
  return AUTH_HASH_PARAM_KEYS.some((key) => params.has(key))
}

/** Remove auth tokens from the URL and browser history after Supabase has consumed them. */
export function stripAuthHashFromUrl(): void {
  if (typeof window === "undefined") return

  if (!urlHasAuthHash()) {
    stripBareHashFromUrl()
    return
  }

  const hash = window.location.hash
  const params = new URLSearchParams(hash.replace(/^#/, ""))
  const type = params.get("type")

  if (type === "recovery") {
    try {
      sessionStorage.setItem(AUTH_RECOVERY_HINT_KEY, "1")
    } catch {
      // Ignore private browsing / quota errors.
    }
  }

  window.history.replaceState(null, "", resolvePostAuthPathname(type))
}

/** Strip hash tokens if Supabase finishes parsing after the initial getSession. */
export function initAuthHashCleanup(client: SupabaseClient): () => void {
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event) => {
    if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") {
      stripAuthHashFromUrl()
      void consumeSupabaseAuthRedirect(client)
    }
  })
  return () => subscription.unsubscribe()
}

/** Run once before the app mounts so public pages never send a rejected JWT. */
export async function initSupabaseAuth(client: SupabaseClient): Promise<void> {
  if (authRecoveryStarted) {
    await recoverFromStaleAuthSession(client)
    await consumeSupabaseAuthRedirect(client)
    return
  }
  authRecoveryStarted = true
  // Parse tokens from URL before cleanup (SDK may already have consumed the hash).
  await client.auth.getSession()
  stripAuthHashFromUrl()
  await recoverFromStaleAuthSession(client)
  await consumeSupabaseAuthRedirect(client)
}

/** Clear cached user data when the session ends (sign-out, expiry, or forced logout). */
export function initAuthStateCleanup(client: SupabaseClient, queryClient: QueryClient): () => void {
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      queryClient.clear()
    }
  })
  return () => subscription.unsubscribe()
}

/** Validates the user with the auth server, then returns the local session for API calls. */
export async function getAuthenticatedSession(
  client: SupabaseClient,
): Promise<{ user: User | null; session: Session | null }> {
  const {
    data: { user },
    error,
  } = await client.auth.getUser()
  if (error) {
    if (isStaleAuthSessionError(error)) await clearStaleAuthSession(client)
    return { user: null, session: null }
  }
  if (!user) return { user: null, session: null }

  const {
    data: { session },
  } = await client.auth.getSession()
  if (!session) return { user, session: null }

  return { user, session }
}
