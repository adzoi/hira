import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"

/** Realtime postgres_changes require the user JWT on the websocket (RLS). */
export async function ensureRealtimeAuth(client: SupabaseClient): Promise<boolean> {
  const {
    data: { session },
  } = await client.auth.getSession()
  const token = session?.access_token
  if (!token) return false
  await client.realtime.setAuth(token)
  return true
}

export function subscribeRealtimeChannel(client: SupabaseClient, channel: RealtimeChannel): RealtimeChannel {
  void ensureRealtimeAuth(client).finally(() => {
    channel.subscribe()
  })
  return channel
}

export function initRealtimeAuth(client: SupabaseClient): () => void {
  void ensureRealtimeAuth(client)
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => {
    void client.realtime.setAuth(session?.access_token ?? null)
  })
  return () => subscription.unsubscribe()
}
