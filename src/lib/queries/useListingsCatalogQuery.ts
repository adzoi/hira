import { useInfiniteQuery } from "@tanstack/react-query"
import { fetchListingsPagePayload } from "../marketplaceEdge.ts"
import { queryKeys } from "../queryKeys.ts"

type ListingsCatalogPageFetcher = (
  page: number,
  searchQuery?: string | null,
) => Promise<{ total: number }>

/**
 * Infinite listings catalog query. `searchQuery` defaults to empty (no server FTS filter).
 */
export function useListingsCatalogQuery(
  searchQuery: string | null | undefined,
  loadPage: ListingsCatalogPageFetcher,
) {
  const q = (searchQuery ?? "").trim()
  return useInfiniteQuery({
    queryKey: queryKeys.listingsCatalog(q),
    queryFn: ({ pageParam }) => loadPage(pageParam, q || null),
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

export async function fetchListingsCatalogPayload(
  page: number,
  searchQuery: string | null = null,
): Promise<unknown> {
  return fetchListingsPagePayload(page, searchQuery)
}
