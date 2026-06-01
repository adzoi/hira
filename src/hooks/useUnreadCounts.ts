import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "../lib/supabase.ts"

export function useUnreadCounts(userId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId || !supabase) return
    const client = supabase

    const channel = client
      .channel(`unread-counts-${userId}`)
      .on(
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
      .on(
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
      .on(
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
      .subscribe()

    return () => {
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
