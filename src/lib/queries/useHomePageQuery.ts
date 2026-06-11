import { useQuery } from "@tanstack/react-query"
import { loadHomePageData, type HomePageData } from "../homeFeed.ts"
import { queryKeys } from "../queryKeys.ts"

export function useHomePageQuery() {
  return useQuery<HomePageData, Error>({
    queryKey: queryKeys.homePage,
    queryFn: loadHomePageData,
    staleTime: 60_000,
  })
}
