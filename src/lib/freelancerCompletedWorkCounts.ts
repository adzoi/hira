import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types.ts"

/**
 * In-memory cache for completed work counts.
 * Keyed by freelancer_profile_id, expires after 60 seconds.
 */
const cache = new Map<string, { count: number; expiresAt: number }>()
const CACHE_TTL_MS = 60_000 // 60 seconds

function getCached(id: string): number | null {
  const entry = cache.get(id)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(id)
    return null
  }
  return entry.count
}

function setCached(id: string, count: number): void {
  cache.set(id, { count, expiresAt: Date.now() + CACHE_TTL_MS })
}

/**
 * Total "completed work" for catalog cards: rows in `completed_jobs` plus
 * listing inquiries (`service_inquiries`) marked completed. Matches dashboard logic.
 *
 * Results are cached in memory for 60s so repeated page loads / pagination
 * don't hammer the DB with extra queries.
 */
export async function mergeFreelancerCompletedWorkCounts(
  client: SupabaseClient<Database>,
  freelancerProfileIds: string[],
  fallbackJobsCountByFreelancerId: Record<string, number>,
): Promise<Record<string, number>> {
  const ids = [...new Set(freelancerProfileIds.filter(Boolean))]
  if (ids.length === 0) return {}

  // Split into cached vs uncached
  const result: Record<string, number> = {}
  const uncachedIds: string[] = []

  for (const id of ids) {
    const cached = getCached(id)
    if (cached !== null) {
      result[id] = cached
    } else {
      uncachedIds.push(id)
    }
  }

  // All hits — return immediately, no DB call
  if (uncachedIds.length === 0) return result

  // Fetch only the uncached IDs
  const [{ data: cjRows, error: cjErr }, { data: siRows, error: siErr }] = await Promise.all([
    client.from("completed_jobs").select("freelancer_profile_id").in("freelancer_profile_id", uncachedIds),
    client
      .from("service_inquiries")
      .select("freelancer_profile_id")
      .eq("status", "completed")
      .in("freelancer_profile_id", uncachedIds),
  ])

  // Initialise counts for uncached IDs
  const countMap: Record<string, number> = Object.fromEntries(uncachedIds.map((id) => [id, 0]))

  if (!cjErr && cjRows) {
    for (const row of cjRows) {
      const fp = row.freelancer_profile_id
      countMap[fp] = (countMap[fp] ?? 0) + 1
    }
  } else {
    // DB error — fall back to profile aggregate
    for (const id of uncachedIds) {
      countMap[id] = Number(fallbackJobsCountByFreelancerId[id] ?? 0)
    }
  }

  if (!siErr && siRows) {
    for (const row of siRows) {
      const fp = row.freelancer_profile_id
      countMap[fp] = (countMap[fp] ?? 0) + 1
    }
  }

  // Store in cache and merge into result
  for (const [id, count] of Object.entries(countMap)) {
    setCached(id, count)
    result[id] = count
  }

  return result
}