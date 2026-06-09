import type { AuthError, Session, SupabaseClient, User } from "@supabase/supabase-js"
import type { QueryClient } from "@tanstack/react-query"

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

/** Run once before the app mounts so public pages never send a rejected JWT. */
export function initSupabaseAuth(client: SupabaseClient): Promise<void> {
  if (authRecoveryStarted) return recoverFromStaleAuthSession(client)
  authRecoveryStarted = true
  return recoverFromStaleAuthSession(client)
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
