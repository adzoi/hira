import type { Session, SupabaseClient, User } from "@supabase/supabase-js"

/** Validates the user with the auth server, then returns the local session for API calls. */
export async function getAuthenticatedSession(
  client: SupabaseClient,
): Promise<{ user: User | null; session: Session | null }> {
  const {
    data: { user },
    error,
  } = await client.auth.getUser()
  if (error || !user) return { user: null, session: null }

  const {
    data: { session },
  } = await client.auth.getSession()
  if (!session) return { user, session: null }

  return { user, session }
}
