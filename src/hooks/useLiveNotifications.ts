import { useCallback, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  fetchNotifications,
  isBellNotification,
  subscribeToNotifications,
  type AppNotification,
} from "../lib/notifications.ts"
import { mergeNotificationList, notificationsQueryKey, prependNotification } from "../lib/notificationQuery.ts"
import { bumpUnreadNotifications, invalidateUnreadCounts } from "../lib/unreadCountsCache.ts"
import { supabase } from "../lib/supabase.ts"

/** Bell feed only — chat messages use the chat icon badge instead. */
export function useLiveNotifications(userId: string | null, enabled: boolean) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: notificationsQueryKey(userId ?? ""),
    queryFn: () => fetchNotifications(supabase!),
    enabled: Boolean(userId) && enabled && Boolean(supabase),
    staleTime: 10_000,
    refetchInterval: enabled ? 12_000 : false,
  })

  useEffect(() => {
    if (!userId || !enabled || !supabase) return
    const client = supabase

    const notifChannel = subscribeToNotifications(client, userId, {
      onInsert: (n) => {
        if (!isBellNotification(n)) return
        bumpUnreadNotifications(queryClient, userId)
        prependNotification(queryClient, userId, n)
      },
      onUpdate: (n) => {
        if (!isBellNotification(n)) return
        queryClient.setQueryData<AppNotification[]>(notificationsQueryKey(userId), (prev) =>
          (prev ?? []).map((x) => (x.id === n.id ? n : x)),
        )
        invalidateUnreadCounts(queryClient, userId)
      },
      onDelete: (id) => {
        queryClient.setQueryData<AppNotification[]>(notificationsQueryKey(userId), (prev) =>
          (prev ?? []).filter((x) => x.id !== id),
        )
      },
    })

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void queryClient.invalidateQueries({ queryKey: notificationsQueryKey(userId) })
      }
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      notifChannel.unsubscribe()
      client.removeChannel(notifChannel)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [userId, enabled, queryClient])

  const mergeFreshWithLive = useCallback(
    (fresh: AppNotification[]) => {
      if (!userId) return
      const bellOnly = fresh.filter(isBellNotification)
      queryClient.setQueryData<AppNotification[]>(notificationsQueryKey(userId), (prev) => {
        const live = (prev ?? []).filter(isBellNotification)
        const freshIds = new Set(bellOnly.map((n) => n.id))
        const pending = live.filter((n) => !freshIds.has(n.id))
        let merged = [...pending]
        for (const n of bellOnly) {
          merged = mergeNotificationList(merged, n)
        }
        return merged.slice(0, 30)
      })
    },
    [queryClient, userId],
  )

  const refreshNotifications = useCallback(() => {
    if (!userId) return
    void queryClient.invalidateQueries({ queryKey: notificationsQueryKey(userId) })
  }, [queryClient, userId])

  return {
    notifications: (query.data ?? []).filter(isBellNotification),
    refreshNotifications,
    mergeFreshWithLive,
  }
}
