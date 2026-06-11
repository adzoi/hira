import { useQuery } from "@tanstack/react-query"
import { loadHomeFeed, type HomeFeedItem } from "../homeFeed.ts"
import { queryKeys } from "../queryKeys.ts"

export function useHomeFeedQuery() {
  return useQuery<HomeFeedItem[], Error>({
    queryKey: queryKeys.homeFeed,
    queryFn: loadHomeFeed,
    staleTime: 60_000,
  })
}
