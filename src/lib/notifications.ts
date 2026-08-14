import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import type { Json } from "./database.types.ts"
import { subscribeRealtimeChannel } from "./realtimeAuth.ts"
import { chatMessagePreviewText } from "./validation.ts"

export type AppNotification = {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  is_read: boolean
  created_at: string
  /** Present when inserted from DB (e.g. job_application modal). */
  payload?: Json | null
}

/** Chat messages use the chat icon; they must not appear on the bell. */
export function isBellNotification(n: Pick<AppNotification, "type">): boolean {
  return n.type !== "chat_message"
}

/**
 * Body text for a chat_message notification / toast.
 * Attachment-only messages use "Sent a file: {filename}" instead of a blank body.
 * (Chat no longer inserts bell rows; this keeps broadcast/email-shaped payloads consistent.)
 */
export function chatNotificationBody(
  body: string | null | undefined,
  attachmentName?: string | null,
): string {
  return chatMessagePreviewText(body, attachmentName)
}

function mapRow(row: Record<string, unknown>): AppNotification {
  const rawTitle = String(row.title ?? "")
  const title = rawTitle === "ახალი ინქირი" ? "ახალი შეტყობინება" : rawTitle
  return {
    id: String(row.id ?? ""),
    type: String(row.type ?? ""),
    title,
    body: row.body != null ? String(row.body) : null,
    link: row.link != null ? String(row.link) : null,
    is_read: Boolean(row.is_read),
    created_at: String(row.created_at ?? ""),
    payload: (row.payload as Json | null | undefined) ?? null,
  }
}

export async function fetchNotifications(client: SupabaseClient): Promise<AppNotification[]> {
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser()
  if (userErr || !user) return []

  const { data, error } = await client
    .from("notifications")
    .select("id,title,body,link,type,is_read,created_at,payload")
    .eq("user_id", user.id)
    .neq("type", "chat_message")
    .order("created_at", { ascending: false })
    .limit(30)

  if (error) {
    console.warn("[notifications] fetch:", error.message)
    return []
  }

  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}

export async function markAsRead(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("notifications").update({ is_read: true }).eq("id", id)
  if (error) throw error
}

export async function markAllAsRead(client: SupabaseClient): Promise<void> {
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser()
  if (userErr || !user) throw new Error("Not authenticated")

  const { error } = await client
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false)

  if (error) throw error
}

export type NotificationRealtimeHandlers = {
  onInsert: (n: AppNotification) => void
  onUpdate: (n: AppNotification) => void
  onDelete: (id: string) => void
}

export function subscribeToNotifications(
  client: SupabaseClient,
  userId: string,
  handlers: NotificationRealtimeHandlers,
): RealtimeChannel {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const channel = client.channel(`notifications:${userId}:${suffix}`)

  const isForUser = (row: Record<string, unknown>) => String(row.user_id ?? "") === userId

  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "notifications",
    },
    (payload) => {
      const row = payload.new as Record<string, unknown>
      if (!row?.id || !isForUser(row)) return
      const n = mapRow(row)
      if (!isBellNotification(n)) return
      handlers.onInsert(n)
    },
  )

  channel.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "notifications",
    },
    (payload) => {
      const row = payload.new as Record<string, unknown>
      if (!row?.id || !isForUser(row)) return
      const n = mapRow(row)
      if (!isBellNotification(n)) return
      handlers.onUpdate(n)
    },
  )

  channel.on(
    "postgres_changes",
    {
      event: "DELETE",
      schema: "public",
      table: "notifications",
    },
    (payload) => {
      const row = payload.old as Record<string, unknown>
      const id = row?.id != null ? String(row.id) : ""
      if (!id) return
      handlers.onDelete(id)
    },
  )

  return subscribeRealtimeChannel(client, channel)
}