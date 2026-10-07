import { supabase } from "./supabase"

export const OAUTH_CALLBACK_PATH = "/auth/callback"

/** sessionStorage: where to go after the provider round-trip, plus any ?ref= code. */
const OAUTH_RETURN_KEY = "hira-oauth-return"

type OAuthReturnState = { next: string | null; referralCode: string | null }

/** Only same-site relative paths; blocks protocol-relative URLs. */
export function sanitizeAuthRedirect(raw: string | null): string | null {
  if (!raw || typeof raw !== "string") return null
  let decoded = raw.trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    return null
  }
  // Backslashes are normalised to `/` by browsers, so `/\evil.com` would become `//evil.com`.
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\")) return null
  if (decoded.startsWith("/login")) return null
  if (decoded.startsWith("/register")) return null
  return decoded
}

/**
 * Leaves the site for Google. Kept in sessionStorage (not the redirect URL) so the
 * Supabase redirect allow-list only needs the bare callback path; the referral code
 * would otherwise be lost because consent-gated storage is in-memory until the
 * cookie banner is answered.
 */
export async function signInWithGoogle(state: OAuthReturnState): Promise<{ error: Error | null }> {
  if (!supabase) return { error: new Error("Supabase is not configured") }
  try {
    sessionStorage.setItem(
      OAUTH_RETURN_KEY,
      JSON.stringify({ next: sanitizeAuthRedirect(state.next), referralCode: state.referralCode }),
    )
  } catch {
    // Private browsing: fall back to the default post-login destination.
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${OAUTH_CALLBACK_PATH}` },
  })
  return { error }
}

export function readOAuthReturnState(): OAuthReturnState {
  try {
    const raw = sessionStorage.getItem(OAUTH_RETURN_KEY)
    if (!raw) return { next: null, referralCode: null }
    const parsed = JSON.parse(raw) as Partial<OAuthReturnState>
    return {
      next: sanitizeAuthRedirect(typeof parsed.next === "string" ? parsed.next : null),
      referralCode: typeof parsed.referralCode === "string" ? parsed.referralCode : null,
    }
  } catch {
    return { next: null, referralCode: null }
  }
}

export function clearOAuthReturnState(): void {
  try {
    sessionStorage.removeItem(OAUTH_RETURN_KEY)
  } catch {
    // Ignore storage errors.
  }
}

const confirmedRoleUserIds = new Set<string>()

/**
 * OAuth signups pick freelancer/hirer on /auth/callback. Email signups chose on the
 * register form, so they are skipped without a request.
 */
export async function needsRoleSelection(user: { id: string; app_metadata?: { provider?: string } }): Promise<boolean> {
  if (!supabase) return false
  if ((user.app_metadata?.provider ?? "email") === "email") return false
  if (confirmedRoleUserIds.has(user.id)) return false
  const { data, error } = await supabase.rpc("my_role_confirmed")
  if (error) return false
  if (data !== false) confirmedRoleUserIds.add(user.id)
  return data === false
}

export function markRoleConfirmed(userId: string): void {
  confirmedRoleUserIds.add(userId)
}
