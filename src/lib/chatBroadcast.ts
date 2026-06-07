import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import type { ChatMessage } from "./chat.ts"
import type { AppNotification } from "./notifications.ts"
import { inboxBroadcastTopic, subscribeInboxBroadcastHub } from "./inboxBroadcastHub.ts"
import { ensureRealtimeAuth, subscribeRealtimeChannel } from "./realtimeAuth.ts"

export type ChatBroadcastPayload = {
  messageId: string
  conversationId: string
  senderId: string
  senderName: string
  body: string
  createdAt: string
}

function conversationBroadcastTopic(conversationId: string): string {
  return `chat-broadcast:${conversationId}`
}

function previewBody(body: string, max = 120): string {
  const normalized = body.replace(/\s+/g, " ").trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max)}…`
}

export function chatBroadcastNotificationId(messageId: string): string {
  return `chat-${messageId}`
}

export function notificationFromChatBroadcast(payload: ChatBroadcastPayload): AppNotification {
  return {
    id: chatBroadcastNotificationId(payload.messageId),
    type: "chat_message",
    title: `ახალი შეტყობინება — ${payload.senderName}`,
    body: previewBody(payload.body),
    link: `/messages/${payload.conversationId}`,
    is_read: false,
    created_at: payload.createdAt,
  }
}

export function chatMessageFromBroadcast(payload: ChatBroadcastPayload, meId: string): ChatMessage {
  return {
    id: payload.messageId,
    conversationId: payload.conversationId,
    senderId: payload.senderId,
    body: payload.body,
    createdAt: payload.createdAt,
    isOwn: payload.senderId === meId,
    readByOther: false,
  }
}

async function sendBroadcast(
  client: SupabaseClient,
  topic: string,
  event: string,
  payload: ChatBroadcastPayload,
): Promise<void> {
  if (!(await ensureRealtimeAuth(client))) return

  const channel = client.channel(topic)
  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") resolve()
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        reject(err ?? new Error(`Broadcast channel ${status}`))
      }
    })
  })
  await channel.send({ type: "broadcast", event, payload })
  channel.unsubscribe()
  void client.removeChannel(channel)
}

/** Push message to open thread + recipient inbox without relying on postgres_changes. */
export async function broadcastChatMessage(
  client: SupabaseClient,
  message: ChatMessage,
  senderName: string,
  recipientId: string,
): Promise<void> {
  const payload: ChatBroadcastPayload = {
    messageId: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName,
    body: message.body,
    createdAt: message.createdAt,
  }

  await sendBroadcast(client, conversationBroadcastTopic(message.conversationId), "message", payload)
  if (recipientId && recipientId !== message.senderId) {
    await sendBroadcast(client, inboxBroadcastTopic(recipientId), "chat_message", payload)
  }
}

export function subscribeToConversationBroadcast(
  client: SupabaseClient,
  conversationId: string,
  meId: string,
  onMessage: (message: ChatMessage) => void,
): RealtimeChannel {
  const channel = client.channel(conversationBroadcastTopic(conversationId))
  channel.on("broadcast", { event: "message" }, ({ payload }) => {
    const row = payload as Partial<ChatBroadcastPayload> | null
    if (!row?.messageId || !row.conversationId || !row.senderId || !row.body || !row.createdAt) return
    onMessage(chatMessageFromBroadcast(row as ChatBroadcastPayload, meId))
  })
  return subscribeRealtimeChannel(client, channel)
}

export function subscribeToInboxBroadcast(
  client: SupabaseClient,
  userId: string,
  onChatMessage: (payload: ChatBroadcastPayload) => void,
): { unsubscribe: () => void } {
  const unsubscribe = subscribeInboxBroadcastHub(client, userId, onChatMessage)
  return { unsubscribe }
}
