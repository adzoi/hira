import type { PostgrestError } from "@supabase/supabase-js"

type PagedChunk<T> = { data: T[] | null; error: PostgrestError | null }

/** Default chunk for Supabase/PostgREST range requests (stay under typical row caps). */
export const SUPABASE_RANGE_PAGE_SIZE = 500

/**
 * Reads every row from a table-backed query by advancing `.range(from, to)` windows
 * until a chunk returns fewer than `pageSize` rows.
 *
 * `fetchChunk` should return a PostgREST builder chain ending in `.range(from, to)` (thenable).
 */
export async function fetchAllRowsByRange<T>(
  fetchChunk: (from: number, to: number) => unknown,
  pageSize = SUPABASE_RANGE_PAGE_SIZE,
): Promise<T[]> {
  if (pageSize < 1) throw new Error("pageSize must be >= 1")
  const out: T[] = []
  let from = 0
  for (;;) {
    const to = from + pageSize - 1
    const { data, error } = await (fetchChunk(from, to) as PromiseLike<PagedChunk<T>>)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return out
}
