import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import type { ChatMessage } from "./chat.ts"
import { subscribeRealtimeChannel } from "./realtimeAuth.ts"
import { validateUuid } from "./validation.ts"

export type MessageRealtimeHandlers = {
  onInsert: (message: ChatMessage) => void
}

export type ConversationReadRealtimeHandlers = {
  onReadUpdate: (payload: { userId: string; lastReadAt: string }) => void
}

export type ChatInboxEvent =
  | { kind: "message"; messageId: string; conversationId: string; senderId: string; body: string; createdAt: string }
  | { kind: "reads" }

function realtimeChannelSuffix(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function requireConversationIdForRealtime(conversationId: string): string {
  const result = validateUuid(conversationId, "საუბარი")
  if (!result.ok) throw new Error(result.message)
  return result.value
}

export function subscribeToConversationMessages(
  client: SupabaseClient,
  conversationId: string,
  meId: string,
  handlers: MessageRealtimeHandlers,
): RealtimeChannel {
  const convId = requireConversationIdForRealtime(conversationId)
  const filter = `conversation_id=eq.${convId}`
  const channel = client.channel(`messages:${convId}:${realtimeChannelSuffix()}`)

  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter,
    },
    (payload) => {
      const row = payload.new as Record<string, unknown>
      if (!row?.id) return
      handlers.onInsert({
        id: String(row.id),
        conversationId: String(row.conversation_id),
        senderId: String(row.sender_id),
        body: String(row.body),
        createdAt: String(row.created_at),
        isOwn: String(row.sender_id) === meId,
        readByOther: false,
      })
    },
  )

  return subscribeRealtimeChannel(client, channel)
}

export function subscribeToConversationReads(
  client: SupabaseClient,
  conversationId: string,
  handlers: ConversationReadRealtimeHandlers,
): RealtimeChannel {
  const convId = requireConversationIdForRealtime(conversationId)
  const filter = `conversation_id=eq.${convId}`
  const channel = client.channel(`conversation-reads:${convId}:${realtimeChannelSuffix()}`)

  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "conversation_reads",
      filter,
    },
    (payload) => {
      const row = payload.new as Record<string, unknown>
      if (!row?.user_id || !row?.last_read_at) return
      handlers.onReadUpdate({
        userId: String(row.user_id),
        lastReadAt: String(row.last_read_at),
      })
    },
  )

  channel.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "conversation_reads",
      filter,
    },
    (payload) => {
      const row = payload.new as Record<string, unknown>
      if (!row?.user_id || !row?.last_read_at) return
      handlers.onReadUpdate({
        userId: String(row.user_id),
        lastReadAt: String(row.last_read_at),
      })
    },
  )

  return subscribeRealtimeChannel(client, channel)
}

/** Live inbox updates when new messages arrive or read state changes. */
export function subscribeToChatInbox(
  client: SupabaseClient,
  userId: string,
  onEvent: (event: ChatInboxEvent) => void,
): RealtimeChannel {
  const channel = client.channel(`chat-inbox:${userId}:${realtimeChannelSuffix()}`)

  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "messages",
    },
    (payload) => {
      const row = payload.new as Record<string, unknown>
      if (!row?.id || !row.conversation_id || !row.sender_id || !row.body || !row.created_at) return
      onEvent({
        kind: "message",
        messageId: String(row.id),
        conversationId: String(row.conversation_id),
        senderId: String(row.sender_id),
        body: String(row.body),
        createdAt: String(row.created_at),
      })
    },
  )

  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "conversation_reads",
      filter: `user_id=eq.${userId}`,
    },
    () => onEvent({ kind: "reads" }),
  )

  channel.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "conversation_reads",
      filter: `user_id=eq.${userId}`,
    },
    () => onEvent({ kind: "reads" }),
  )

  return subscribeRealtimeChannel(client, channel)
}
