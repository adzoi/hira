import type { QueryClient } from "@tanstack/react-query"

export type UnreadCountsRow = {
  unread_notifications_count: number
  unread_messages_count: number
}

export function unreadCountsQueryKey(userId: string) {
  return ["unread-counts", userId] as const
}

export function bumpUnreadNotifications(queryClient: QueryClient, userId: string) {
  queryClient.setQueryData<UnreadCountsRow>(unreadCountsQueryKey(userId), (old) => ({
    unread_notifications_count: (old?.unread_notifications_count ?? 0) + 1,
    unread_messages_count: old?.unread_messages_count ?? 0,
  }))
}

export function bumpUnreadMessages(queryClient: QueryClient, userId: string) {
  queryClient.setQueryData<UnreadCountsRow>(unreadCountsQueryKey(userId), (old) => ({
    unread_notifications_count: old?.unread_notifications_count ?? 0,
    unread_messages_count: (old?.unread_messages_count ?? 0) + 1,
  }))
}

export function invalidateUnreadCounts(queryClient: QueryClient, userId: string) {
  void queryClient.invalidateQueries({ queryKey: unreadCountsQueryKey(userId) })
}
