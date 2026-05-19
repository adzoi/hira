import { isSupabaseConfigured, supabase } from "./supabase.ts"
import { getAuthenticatedSession } from "./supabaseAuth.ts"

type RecordFreelancerVisitArgs = {
  kind: "freelancer"
  freelancerProfileId: string
  profileOwnerUserId: string
}

type RecordHirerVisitArgs = {
  kind: "hirer"
  hirerProfileId: string
  profileOwnerUserId: string
}

export type RecordProfileVisitArgs = RecordFreelancerVisitArgs | RecordHirerVisitArgs

/** Fire-and-forget: logs a profile page view unless the viewer is the profile owner. */
export async function recordProfileVisit(args: RecordProfileVisitArgs): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return

  const { user } = await getAuthenticatedSession(supabase)
  const visitor_user_id = user?.id ?? null

  if (visitor_user_id && visitor_user_id === args.profileOwnerUserId) return

  if (args.kind === "freelancer") {
    const { error } = await supabase.from("profile_visits").insert({
      visitor_user_id,
      freelancer_profile_id: args.freelancerProfileId,
    })
    if (error && import.meta.env.DEV) {
      console.warn("[profileVisits]", error.message)
    }
  } else {
    const { error } = await supabase.from("profile_visits").insert({
      visitor_user_id,
      hirer_profile_id: args.hirerProfileId,
    })
    if (error && import.meta.env.DEV) {
      console.warn("[profileVisits]", error.message)
    }
  }
}

/**
 * Count visits for a freelancer profile. PostgREST sends the **logged-in user’s JWT**.
 * RLS only returns rows the user may read (their own profile’s visits).
 *
 * Only **call after** you’ve verified `session.user.id === freelancer_profiles.user_id` in the UI,
 * so you never show a misleading “0” to non-owners when RLS hides all rows.
 */
export async function countFreelancerProfileVisits(freelancerProfileId: string): Promise<number | null> {
  if (!isSupabaseConfigured || !supabase) return null

  const { count, error } = await supabase
    .from("profile_visits")
    .select("*", { count: "exact", head: true })
    .eq("freelancer_profile_id", freelancerProfileId)

  if (error) {
    if (import.meta.env.DEV) {
      console.warn("[profileVisits] countFreelancerProfileVisits", error.message)
    }
    return null
  }
  return count ?? 0
}

/** Same as {@link countFreelancerProfileVisits} for hirer profiles; caller must verify ownership first. */
export async function countHirerProfileVisits(hirerProfileId: string): Promise<number | null> {
  if (!isSupabaseConfigured || !supabase) return null

  const { count, error } = await supabase
    .from("profile_visits")
    .select("*", { count: "exact", head: true })
    .eq("hirer_profile_id", hirerProfileId)

  if (error) {
    if (import.meta.env.DEV) {
      console.warn("[profileVisits] countHirerProfileVisits", error.message)
    }
    return null
  }
  return count ?? 0
}
