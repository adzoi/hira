import { isSupabaseConfigured, supabase } from "./supabase"

export type FollowListProfile = {
  id: string
  full_name: string
  avatar_url: string | null
  user_type: string
}

function requireSupabase(): NonNullable<typeof supabase> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase არ არის კონფიგურირებული.")
  }
  return supabase
}

/** Map profile IDs to public URLs (`/freelancer/:slug` or `/hirer/:uuid`). Two batched reads. */
export async function resolveProfilePublicHrefByIds(profileIds: string[]): Promise<Record<string, string>> {
  const client = requireSupabase()
  const unique = Array.from(new Set(profileIds.filter(Boolean)))
  const out: Record<string, string> = {}
  if (unique.length === 0) return out

  const [fpRes, hpRes] = await Promise.all([
    client.from("freelancer_profiles").select("user_id,slug").in("user_id", unique),
    client.from("hirer_profiles").select("id,user_id").in("user_id", unique),
  ])

  if (fpRes.error) throw fpRes.error
  if (hpRes.error) throw hpRes.error

  for (const row of fpRes.data ?? []) {
    const uid = String(row.user_id ?? "").trim()
    const slug = typeof row.slug === "string" ? row.slug.trim() : ""
    if (uid && slug) out[uid] = `/freelancer/${encodeURIComponent(slug)}`
  }
  for (const row of hpRes.data ?? []) {
    const uid = String(row.user_id ?? "").trim()
    const hid = String(row.id ?? "").trim()
    if (!uid || !hid || out[uid]) continue
    out[uid] = `/hirer/${hid}`
  }
  return out
}

/** Public follower count for a profile (`profiles.id`). */
export async function countFollowers(profileId: string): Promise<number> {
  const client = requireSupabase()
  const { count, error } = await client
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", profileId)
  if (error) throw error
  return typeof count === "number" ? count : 0
}

/** How many profiles this user follows (`follower_id` = `profiles.id`). */
export async function countFollowing(profileId: string): Promise<number> {
  const client = requireSupabase()
  const { count, error } = await client
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", profileId)
  if (error) throw error
  return typeof count === "number" ? count : 0
}

export async function followUser(followingId: string): Promise<void> {
  const client = requireSupabase()
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser()
  if (userErr || !user) throw new Error("შესვლა საჭიროა.")
  if (!followingId.trim() || user.id === followingId) throw new Error("ეს პროფილი ვერ გამოგყავხარ.")

  const { error } = await client.from("follows").insert({ follower_id: user.id, following_id: followingId })
  const code = typeof (error as { code?: string } | null)?.code === "string" ? (error as { code: string }).code : ""
  if (error && code !== "23505") throw error
}

export async function unfollowUser(followingId: string): Promise<void> {
  const client = requireSupabase()
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser()
  if (userErr || !user) throw new Error("შესვლა საჭიროა.")

  const { error } = await client.from("follows").delete().eq("follower_id", user.id).eq("following_id", followingId)
  if (error) throw error
}

export async function isFollowing(followingId: string): Promise<boolean> {
  const client = requireSupabase()
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser()
  if (userErr || !user) return false

  const { data, error } = await client
    .from("follows")
    .select("follower_id")
    .eq("follower_id", user.id)
    .eq("following_id", followingId)
    .maybeSingle()

  if (error) throw error
  return data != null
}

async function profilesByIdsOrdered(idsOrdered: string[]): Promise<FollowListProfile[]> {
  const client = requireSupabase()
  const uniqueSet = Array.from(new Set(idsOrdered.filter(Boolean)))
  if (uniqueSet.length === 0) return []

  const { data, error } = await client.from("profiles").select("id,full_name,avatar_url,user_type").in("id", uniqueSet)

  if (error) throw error
  const rows = (data ?? []) as FollowListProfile[]
  const byId = new Map(rows.map((p) => [p.id, p]))
  return idsOrdered.map((id) => byId.get(id)).filter((p): p is FollowListProfile => Boolean(p))
}

export async function getFollowers(profileId: string): Promise<FollowListProfile[]> {
  const client = requireSupabase()
  const { data: rows, error } = await client.from("follows").select("follower_id").eq("following_id", profileId)
  if (error) throw error
  const followerIds = (rows ?? []).map((r) => String((r as { follower_id?: string }).follower_id ?? "").trim()).filter(Boolean)
  return profilesByIdsOrdered(followerIds)
}

export async function getFollowing(profileId: string): Promise<FollowListProfile[]> {
  const client = requireSupabase()
  const { data: rows, error } = await client.from("follows").select("following_id").eq("follower_id", profileId)
  if (error) throw error
  const followingIds = (rows ?? []).map((r) => String((r as { following_id?: string }).following_id ?? "").trim()).filter(Boolean)
  return profilesByIdsOrdered(followingIds)
}
