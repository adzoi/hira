import type { FreelancerMiniCardData } from "../../components/FreelancerMiniCard.tsx"
import { supabase } from "../supabase.ts"

export type LandingCategory = { slug: string; name_ka: string; name_en: string | null }

export type LandingJob = {
  id: string
  title: string
  title_en: string | null
  budget_type: string
  budget_min: number | null
  budget_max: number | null
  location_type: string
  created_at: string
}

export type FreelancerLandingData = {
  category: LandingCategory & { id: string }
  parent: LandingCategory | null
  city: string | null
  total_count: number
  freelancers: FreelancerMiniCardData[]
  cities: Array<{ city: string; count: number }>
  related: Array<LandingCategory & { count: number }>
  jobs: LandingJob[]
}

export type FreelancerLandingIndex = {
  categories: Array<LandingCategory & { parent_slug: string | null; count: number; sort_order: number }>
  combos: Array<{ slug: string; city: string; count: number }>
}

/** null = unknown category slug (render 404). */
export async function fetchFreelancerLanding(category: string, city: string | null): Promise<FreelancerLandingData | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc("get_freelancer_landing", {
    p_category: category,
    p_city: city,
    p_limit: 24,
  })
  if (error) throw error
  return (data as FreelancerLandingData | null) ?? null
}

export async function fetchFreelancerLandingIndex(): Promise<FreelancerLandingIndex> {
  if (!supabase) return { categories: [], combos: [] }
  const { data, error } = await supabase.rpc("get_freelancer_landing_index")
  if (error) throw error
  const payload = (data ?? {}) as Partial<FreelancerLandingIndex>
  return { categories: payload.categories ?? [], combos: payload.combos ?? [] }
}
