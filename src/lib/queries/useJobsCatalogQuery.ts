import { useInfiniteQuery } from "@tanstack/react-query"
import { fetchJobsPagePayload } from "../marketplaceEdge.ts"
import { queryKeys } from "../queryKeys.ts"

type JobsCatalogPageFetcher = (
  category: string,
  page: number,
  searchQuery?: string | null,
) => Promise<{ total: number }>

/**
 * Infinite jobs catalog query. `searchQuery` defaults to empty (no server FTS filter).
 * Pass the same page mapper used by Jobs.tsx (or any fetcher returning `{ total }`).
 */
export function useJobsCatalogQuery(
  category: string,
  searchQuery: string | null | undefined,
  loadPage: JobsCatalogPageFetcher,
) {
  const q = (searchQuery ?? "").trim()
  return useInfiniteQuery({
    queryKey: queryKeys.jobsCatalog(category, q),
    queryFn: ({ pageParam }) => loadPage(category, pageParam, q || null),
    initialPageParam: 1,
    staleTime: 30_000,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const pageSize = 20
      const loadedOffset = lastPageParam * pageSize
      if (loadedOffset < lastPage.total) return lastPageParam + 1
      return undefined
    },
  })
}

export async function fetchJobsCatalogPayload(
  category: string,
  page: number,
  searchQuery: string | null = null,
): Promise<unknown> {
  return fetchJobsPagePayload(category, page, searchQuery)
}
