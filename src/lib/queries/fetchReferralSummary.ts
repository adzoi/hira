import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { queryKeys } from "../queryKeys.ts"
import { supabase } from "../supabase.ts"

export type ReferralSummary = {
  referral_code: string | null
  coins: number
  pending: number
  rewarded: number
}

export async function fetchReferralSummary(): Promise<ReferralSummary | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc("get_my_referral_summary")
  if (error) throw error
  return (data as ReferralSummary | null) ?? null
}

/** Signed-in user's coin balance and referral stats (null when signed out or not migrated yet). */
export function useReferralSummary() {
  const [userId, setUserId] = useState("")
  useEffect(() => {
    void supabase?.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? ""))
  }, [])
  const query = useQuery({
    queryKey: queryKeys.referralSummary(userId),
    queryFn: fetchReferralSummary,
    enabled: Boolean(userId),
    staleTime: 30_000,
  })
  return { ...query, userId }
}
