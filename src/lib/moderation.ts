import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../types/database.types.ts"

type Client = SupabaseClient<Database>

export type ReportTargetType = "user" | "job" | "service" | "forum_post" | "message"
export type ReportReason = "spam" | "scam" | "inappropriate" | "harassment" | "fake" | "other"

export const REPORT_REASONS: ReportReason[] = ["spam", "scam", "fake", "harassment", "inappropriate", "other"]

/** Raised by DB triggers when either side has blocked the other. */
export function isBlockedError(error: unknown): boolean {
  const message = (error as { message?: string } | null)?.message ?? String(error ?? "")
  return message.includes("USER_BLOCKED")
}

export async function fetchBlockedUserIds(client: Client, userId: string): Promise<Set<string>> {
  const { data, error } = await client.from("user_blocks").select("blocked_id").eq("blocker_id", userId)
  if (error) return new Set()
  return new Set((data ?? []).map((row) => row.blocked_id))
}

export async function isUserBlocked(client: Client, userId: string, otherUserId: string): Promise<boolean> {
  const { data } = await client
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", userId)
    .eq("blocked_id", otherUserId)
    .maybeSingle()
  return Boolean(data)
}

export async function blockUser(client: Client, userId: string, otherUserId: string) {
  const { error } = await client
    .from("user_blocks")
    .upsert({ blocker_id: userId, blocked_id: otherUserId }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true })
  return { error }
}

export async function unblockUser(client: Client, userId: string, otherUserId: string) {
  const { error } = await client.from("user_blocks").delete().eq("blocker_id", userId).eq("blocked_id", otherUserId)
  return { error }
}

/** Files a report; reporting the same thing twice counts as success. */
export async function reportContent(
  client: Client,
  input: {
    reporterId: string
    targetType: ReportTargetType
    targetId: string
    reason: ReportReason
    details?: string
  },
) {
  const details = input.details?.trim().slice(0, 1000) || null
  const { error } = await client.from("reports").insert({
    reporter_id: input.reporterId,
    target_type: input.targetType,
    target_id: input.targetId,
    reason: input.reason,
    details,
  })
  if (error?.code === "23505") return { error: null }
  return { error }
}
