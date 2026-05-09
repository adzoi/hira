import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import type { Json } from "./database.types.ts"

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

function mapRow(row: Record<string, unknown>): AppNotification {
  return {
    id: String(row.id ?? ""),
    type: String(row.type ?? ""),
    title: String(row.title ?? ""),
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

export function subscribeToNotifications(
  client: SupabaseClient,
  userId: string,
  onNew: (n: AppNotification) => void,
): RealtimeChannel {
  return client
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>
        if (!row?.id) return
        onNew(mapRow(row))
      },
    )
    .subscribe()
}
