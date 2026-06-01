import { useQuery } from "@tanstack/react-query"
import { isSupabaseConfigured, supabase } from "../supabase.ts"
import { queryKeys } from "../queryKeys.ts"

export type HomeStats = {
  freelancerCount: number
  jobCount: number
  completedCount: number
}

async function fetchHomeStats(): Promise<HomeStats> {
  if (!supabase) {
    return { freelancerCount: 0, jobCount: 0, completedCount: 0 }
  }

  const [freelancerRes, jobsRes, completedRes] = await Promise.all([
    supabase
      .from("freelancer_profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_public", true)
      .limit(1),
    supabase.from("jobs").select("*", { count: "exact", head: true }).limit(1),
    supabase.from("completed_jobs").select("*", { count: "exact", head: true }).limit(1),
  ])

  return {
    freelancerCount: freelancerRes.count ?? 0,
    jobCount: jobsRes.count ?? 0,
    completedCount: completedRes.count ?? 0,
  }
}

export function useHomeStatsQuery() {
  return useQuery({
    queryKey: queryKeys.homeStats,
    queryFn: fetchHomeStats,
    enabled: isSupabaseConfigured,
    staleTime: 60_000,
  })
}
