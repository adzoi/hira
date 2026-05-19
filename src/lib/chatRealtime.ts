import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import type { ChatMessage } from "./chat.ts"

export type MessageRealtimeHandlers = {
  onInsert: (message: ChatMessage) => void
}

export type ConversationReadRealtimeHandlers = {
  onReadUpdate: (payload: { userId: string; lastReadAt: string }) => void
}

export function subscribeToConversationMessages(
  client: SupabaseClient,
  conversationId: string,
  meId: string,
  handlers: MessageRealtimeHandlers,
): RealtimeChannel {
  const filter = `conversation_id=eq.${conversationId}`
  return client
    .channel(`messages:${conversationId}`)
    .on(
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
    .subscribe()
}

export function subscribeToConversationReads(
  client: SupabaseClient,
  conversationId: string,
  handlers: ConversationReadRealtimeHandlers,
): RealtimeChannel {
  const filter = `conversation_id=eq.${conversationId}`
  return client
    .channel(`conversation-reads:${conversationId}`)
    .on(
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
    .on(
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
    .subscribe()
}

/** Refetch unread count when new messages arrive or read state changes. */
export function subscribeToChatInbox(client: SupabaseClient, userId: string, onChange: () => void): RealtimeChannel {
  return client
    .channel(`chat-inbox:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
      },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "conversation_reads",
        filter: `user_id=eq.${userId}`,
      },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "conversation_reads",
        filter: `user_id=eq.${userId}`,
      },
      () => onChange(),
    )
    .subscribe()
}
