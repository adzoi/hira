import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "../lib/supabase.ts"

export function useUnreadCounts(userId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId || !supabase) return
    const client = supabase

    // Avoid reusing an existing subscribed channel (React 18 strict-mode effects can mount twice).
    const suffix =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const channel = client.channel(`unread-counts-${userId}-${suffix}`)

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      () => {
        queryClient.invalidateQueries({ queryKey: ["unread-counts", userId] })
      },
    )

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
      },
      () => {
        queryClient.invalidateQueries({ queryKey: ["unread-counts", userId] })
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
      () => {
        queryClient.invalidateQueries({ queryKey: ["unread-counts", userId] })
      },
    )

    channel.subscribe()

    return () => {
      channel.unsubscribe()
      client.removeChannel(channel)
    }
  }, [userId, queryClient])

  const { data } = useQuery({
    queryKey: ["unread-counts", userId],
    queryFn: async () => {
      const { data, error } = await supabase!
        .from("profiles")
        .select("unread_notifications_count, unread_messages_count")
        .eq("id", userId!)
        .single()
      if (error) throw error
      return data
    },
    enabled: Boolean(userId) && Boolean(supabase),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  return {
    unreadNotifications: data?.unread_notifications_count ?? 0,
    unreadMessages: data?.unread_messages_count ?? 0,
  }
}
