import { useEffect } from "react"
import { isSupabaseConfigured, supabase } from "./supabase.ts"

const FLUSH_DELAY_MS = 1500
const MAX_PER_CALL = 60
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ids already counted during this page load, so re-renders and "load more" don't double count. */
const counted = new Set<string>()
const pending = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

function flush() {
  flushTimer = null
  if (!supabase || pending.size === 0) return
  const ids = [...pending].slice(0, MAX_PER_CALL)
  for (const id of ids) pending.delete(id)
  void supabase.rpc("record_search_impressions", { p_freelancer_profile_ids: ids }).then(({ error }) => {
    if (error && import.meta.env.DEV) console.warn("[searchImpressions]", error.message)
  })
  if (pending.size > 0) flushTimer = setTimeout(flush, FLUSH_DELAY_MS)
}

/** Queue freelancer profile ids shown in search results (fire-and-forget, batched). */
export function recordSearchImpressions(freelancerProfileIds: Iterable<string>): void {
  if (!isSupabaseConfigured) return
  for (const id of freelancerProfileIds) {
    // Skip placeholder/demo cards, which don't have real profile ids.
    if (!UUID_RE.test(id) || counted.has(id)) continue
    counted.add(id)
    pending.add(id)
  }
  if (pending.size > 0 && flushTimer === null) flushTimer = setTimeout(flush, FLUSH_DELAY_MS)
}

/** Records impressions for the ids currently listed; the key keeps the effect cheap across renders. */
export function useSearchImpressions(freelancerProfileIds: string[]): void {
  const key = freelancerProfileIds.join(",")
  useEffect(() => {
    if (key) recordSearchImpressions(key.split(","))
  }, [key])
}
