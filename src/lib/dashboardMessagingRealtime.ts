import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"

/**
 * Subscribes to listing inquiries and job applications. RLS on the tables determines
 * which row events the connected user receives; callers should debounce refetches.
 */
export function subscribeToDashboardMessaging(
  client: SupabaseClient,
  channelKey: string,
  onActivity: () => void,
): RealtimeChannel {
  return client
    .channel(`dashboard-messaging:${channelKey}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "service_inquiries" }, () => {
      onActivity()
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "job_applications" }, () => {
      onActivity()
    })
    .subscribe()
}
