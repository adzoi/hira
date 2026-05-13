import type { SupabaseClient } from "@supabase/supabase-js"

export type SavedResourceType = "freelancer" | "hirer" | "job" | "service"

export async function fetchSavedState(
  client: SupabaseClient,
  userId: string,
  resourceType: SavedResourceType,
  resourceId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("user_saved_items")
    .select("id")
    .eq("user_id", userId)
    .eq("resource_type", resourceType)
    .eq("resource_id", resourceId)
    .maybeSingle()
  if (error || !data) return false
  return true
}

/** Returns whether the item is saved after the operation. */
export async function toggleSavedItem(
  client: SupabaseClient,
  userId: string,
  resourceType: SavedResourceType,
  resourceId: string,
): Promise<{ saved: boolean; error: string | null }> {
  const { data: existing, error: selErr } = await client
    .from("user_saved_items")
    .select("id")
    .eq("user_id", userId)
    .eq("resource_type", resourceType)
    .eq("resource_id", resourceId)
    .maybeSingle()
  if (selErr) return { saved: false, error: selErr.message }

  if (existing?.id) {
    const { error: delErr } = await client.from("user_saved_items").delete().eq("id", existing.id)
    if (delErr) return { saved: true, error: delErr.message }
    return { saved: false, error: null }
  }

  const { error: insErr } = await client.from("user_saved_items").insert({
    user_id: userId,
    resource_type: resourceType,
    resource_id: resourceId,
  })
  if (insErr) return { saved: false, error: insErr.message }
  return { saved: true, error: null }
}
