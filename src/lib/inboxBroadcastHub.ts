import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import type { ChatBroadcastPayload } from "./chatBroadcast.ts"
import { subscribeRealtimeChannel } from "./realtimeAuth.ts"

/** Private topic; `realtime.messages` RLS only lets the owner join. */
export function inboxBroadcastTopic(userId: string): string {
  return `inbox-broadcast:${userId}`
}

type Hub = {
  channel: RealtimeChannel
  listeners: Set<(payload: ChatBroadcastPayload) => void>
}

const hubs = new Map<string, Hub>()

/** One Realtime channel per user — avoids duplicate subscriptions tearing each other down. */
export function subscribeInboxBroadcastHub(
  client: SupabaseClient,
  userId: string,
  listener: (payload: ChatBroadcastPayload) => void,
): () => void {
  let hub = hubs.get(userId)
  if (!hub) {
    const channel = client.channel(inboxBroadcastTopic(userId), { config: { private: true } })
    const listeners = new Set<(payload: ChatBroadcastPayload) => void>()
    channel.on("broadcast", { event: "chat_message" }, ({ payload }) => {
      const row = payload as Partial<ChatBroadcastPayload> | null
      if (!row?.messageId || !row.conversationId || !row.senderId || !row.createdAt) return
      const hasBody = Boolean((row.body ?? "").trim())
      const hasAttachment = Boolean(row.attachmentUrl)
      if (!hasBody && !hasAttachment) return
      for (const fn of listeners) {
        fn(row as ChatBroadcastPayload)
      }
    })
    subscribeRealtimeChannel(client, channel)
    hub = { channel, listeners }
    hubs.set(userId, hub)
  }

  hub.listeners.add(listener)
  return () => {
    const current = hubs.get(userId)
    if (!current) return
    current.listeners.delete(listener)
    if (current.listeners.size === 0) {
      current.channel.unsubscribe()
      void client.removeChannel(current.channel)
      hubs.delete(userId)
    }
  }
}
