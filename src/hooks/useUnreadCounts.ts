import { useCallback, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { fetchUnreadConversationCount } from "../lib/chat.ts"
import type { ChatBroadcastPayload } from "../lib/chatBroadcast.ts"
import { oncePerChatMessage } from "../lib/chatMessageDedup.ts"
import { subscribeInboxBroadcastHub } from "../lib/inboxBroadcastHub.ts"
import { unreadCountsQueryKey } from "../lib/unreadCountsCache.ts"
import { supabase } from "../lib/supabase.ts"
import { subscribeRealtimeChannel } from "../lib/realtimeAuth.ts"

export function useUnreadCounts(userId: string | null) {
  const queryClient = useQueryClient()
  const syncTimerRef = useRef<number | null>(null)

  const scheduleSync = useCallback(() => {
    if (!userId) return
    if (syncTimerRef.current != null) window.clearTimeout(syncTimerRef.current)
    syncTimerRef.current = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: unreadCountsQueryKey(userId) })
    }, 400)
  }, [queryClient, userId])

  const onIncomingMessage = useCallback(
    (messageId: string, senderId: string) => {
      if (!userId || senderId === userId) return
      oncePerChatMessage(messageId, scheduleSync)
    },
    [userId, scheduleSync],
  )

  useEffect(() => {
    if (!userId || !supabase) return
    const client = supabase

    const unsubscribeInbox = subscribeInboxBroadcastHub(client, userId, (payload: ChatBroadcastPayload) => {
      onIncomingMessage(payload.messageId, payload.senderId)
    })

    const suffix =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const channel = client.channel(`unread-counts-${userId}-${suffix}`)

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const row = payload.new as Record<string, unknown>
        const messageId = row?.id != null ? String(row.id) : ""
        const senderId = row?.sender_id != null ? String(row.sender_id) : ""
        onIncomingMessage(messageId, senderId)
      },
    )

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "conversation_reads",
        filter: `user_id=eq.${userId}`,
      },
      () => scheduleSync(),
    )

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>
        if (String(row.type ?? "") === "chat_message") return
        scheduleSync()
      },
    )

    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      () => scheduleSync(),
    )

    subscribeRealtimeChannel(client, channel)

    return () => {
      unsubscribeInbox()
      channel.unsubscribe()
      client.removeChannel(channel)
      if (syncTimerRef.current != null) window.clearTimeout(syncTimerRef.current)
    }
  }, [userId, onIncomingMessage, scheduleSync])

  const { data } = useQuery({
    queryKey: unreadCountsQueryKey(userId!),
    queryFn: async () => {
      const [chatUnread, profileRes] = await Promise.all([
        fetchUnreadConversationCount(supabase!),
        supabase!
          .from("profiles")
          .select("unread_notifications_count")
          .eq("id", userId!)
          .single(),
      ])
      if (profileRes.error) throw profileRes.error
      return {
        unread_messages_count: chatUnread,
        unread_notifications_count: profileRes.data?.unread_notifications_count ?? 0,
      }
    },
    enabled: Boolean(userId) && Boolean(supabase),
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  })

  return {
    unreadNotifications: data?.unread_notifications_count ?? 0,
    unreadMessages: data?.unread_messages_count ?? 0,
  }
}
