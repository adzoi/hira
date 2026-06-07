import type { QueryClient } from "@tanstack/react-query"
import type { AppNotification } from "./notifications.ts"

export function notificationsQueryKey(userId: string) {
  return ["notifications", userId] as const
}

export function mergeNotificationList(prev: AppNotification[], incoming: AppNotification): AppNotification[] {
  const withoutDupes = prev.filter((x) => {
    if (x.id === incoming.id) return false
    if (
      x.id.startsWith("chat-") &&
      incoming.type === "chat_message" &&
      incoming.link &&
      x.link === incoming.link &&
      x.body === incoming.body
    ) {
      return false
    }
    if (
      incoming.id.startsWith("chat-") &&
      x.type === "chat_message" &&
      x.link &&
      incoming.link === x.link &&
      x.body === incoming.body
    ) {
      return false
    }
    return true
  })
  return [incoming, ...withoutDupes]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 30)
}

export function prependNotification(
  queryClient: QueryClient,
  userId: string,
  incoming: AppNotification,
): void {
  queryClient.setQueryData<AppNotification[]>(notificationsQueryKey(userId), (prev) =>
    mergeNotificationList(prev ?? [], incoming),
  )
}

export function patchNotification(
  queryClient: QueryClient,
  userId: string,
  id: string,
  patch: Partial<AppNotification>,
): void {
  queryClient.setQueryData<AppNotification[]>(notificationsQueryKey(userId), (prev) =>
    (prev ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n)),
  )
}

export function removeNotification(queryClient: QueryClient, userId: string, id: string): void {
  queryClient.setQueryData<AppNotification[]>(notificationsQueryKey(userId), (prev) =>
    (prev ?? []).filter((n) => n.id !== id),
  )
}
