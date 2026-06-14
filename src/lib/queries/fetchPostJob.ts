import { parseJobContactPreference, normalizeJobContactPreference } from "../jobContactPreference.ts"
import {
  categoryIdsWithChildren,
  rootIdContainingCategory,
  type CategoryBranchRow,
} from "../marketplaceCategoryTree.ts"
import { isSupabaseConfigured, supabase } from "../supabase.ts"

const MAX_JOB_IMAGES = 3

export type CategoryRow = {
  id: string
  name_ka: string
  name_en?: string | null
  is_active: boolean | null
  sort_order: number | null
  parent_id: string | null
  slug?: string | null
}

export type SkillRow = { id: string; name: string; category_id: string | null; is_approved: boolean | null }
export type SubcategoryRow = {
  id: string
  name_ka: string
  name_en?: string | null
  category_id: string
  is_active: boolean | null
}

export type PostJobEditData = {
  rootCategoryId: string
  categoryId: string
  subcategories: SubcategoryRow[]
  title: string
  titleEn: string
  subcategoryId: string
  description: string
  descriptionEn: string
  isUrgent: boolean
  budgetType: string
  budgetMin: string
  budgetMax: string
  durationType: string
  locationType: string
  contactEmail: boolean
  contactPhone: boolean
  applicationDeadline: string
  vacancies: number
  acceptedCountSnapshot: number
  selectedSkillIds: string[]
  existingImageUrls: string[]
}

export type PostJobQueryData = {
  userId: string
  hirerProfileId: string
  categories: CategoryRow[]
  allSkills: SkillRow[]
  edit?: PostJobEditData
  redirectTo?: string
}

export async function fetchPostJob(jobId?: string): Promise<PostJobQueryData> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase არ არის კონფიგურირებული.")
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { userId: "", hirerProfileId: "", categories: [], allSkills: [], redirectTo: "/login" }
  }

  const { data: profile, error: profileErr } = await supabase.from("profiles").select("user_type").eq("id", user.id).single()
  if (profileErr) throw profileErr
  if (profile?.user_type !== "hirer") {
    return { userId: user.id, hirerProfileId: "", categories: [], allSkills: [], redirectTo: "/dashboard" }
  }

  const [{ data: hirerRow, error: hirerErr }, { data: catRows, error: catErr }] = await Promise.all([
    supabase.from("hirer_profiles").select("id").eq("user_id", user.id).maybeSingle(),
    supabase.from("categories").select("id,name_ka,name_en,is_active,sort_order,parent_id,slug").eq("is_active", true).order("sort_order", { ascending: true }),
  ])

  if (hirerErr) throw hirerErr
  if (catErr) throw catErr

  if (!hirerRow?.id) {
    return { userId: user.id, hirerProfileId: "", categories: [], allSkills: [], redirectTo: "/onboarding" }
  }

  const fullCats: CategoryRow[] = (catRows ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ""),
    name_ka: String(row.name_ka ?? ""),
    name_en: (row.name_en as string | null | undefined) ?? null,
    is_active: (row.is_active as boolean | null | undefined) ?? null,
    sort_order: (row.sort_order as number | null | undefined) ?? null,
    parent_id: (row.parent_id as string | null | undefined) ?? null,
    slug: (row.slug as string | null | undefined) ?? null,
  }))

  const { data: skillRows, error: skillErr } = await supabase
    .from("skills")
    .select("id,name,category_id,is_approved")
    .eq("is_approved", true)
    .order("name", { ascending: true })

  const allSkills = skillErr
    ? (import.meta.env.DEV && console.warn("[PostJob] skills catalog:", skillErr), [])
    : (skillRows ?? [])

  const base: PostJobQueryData = {
    userId: user.id,
    hirerProfileId: hirerRow.id,
    categories: fullCats,
    allSkills,
  }

  if (!jobId) return base

  const { data: jobRow, error: jobErr } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("hirer_profile_id", hirerRow.id)
    .maybeSingle()

  if (jobErr || !jobRow) {
    return { ...base, redirectTo: "/dashboard" }
  }

  const { data: jsRows, error: jsErr } = await supabase.from("job_skills").select("skill_id").eq("job_id", jobRow.id)
  if (jsErr) throw jsErr

  const byId = new Map(fullCats.map((c) => [c.id, c]))
  let midForQuery = String(jobRow.category_id ?? "")
  const initialNode = midForQuery ? byId.get(midForQuery) : undefined
  if (initialNode && initialNode.parent_id == null && jobRow.subcategory_id) {
    const { data: loneSub } = await supabase.from("subcategories").select("category_id").eq("id", jobRow.subcategory_id).maybeSingle()
    if (loneSub?.category_id) midForQuery = loneSub.category_id
  }

  let resolvedMid = midForQuery
  let resolvedRoot = ""
  if (resolvedMid) {
    const node = byId.get(resolvedMid)
    const hasKids = categoryIdsWithChildren(fullCats as CategoryBranchRow[])
    if (node?.parent_id) {
      resolvedRoot = rootIdContainingCategory(fullCats as CategoryBranchRow[], resolvedMid)
    } else if (hasKids.has(resolvedMid)) {
      resolvedRoot = resolvedMid
      resolvedMid = ""
    } else {
      resolvedRoot = resolvedMid
    }
  }

  let subRows: SubcategoryRow[] = []
  if (midForQuery) {
    const { data, error: subErr } = await supabase
      .from("subcategories")
      .select("id,name_ka,name_en,category_id,is_active")
      .eq("category_id", midForQuery)
      .eq("is_active", true)
      .order("name_ka", { ascending: true })

    if (subErr) throw subErr
    subRows = data ?? []
  }

  const parsedContact = parseJobContactPreference(
    normalizeJobContactPreference(String(jobRow.contact_preference ?? "email")),
  )

  const jr = jobRow as { vacancies?: unknown; accepted_count?: unknown }
  const vacN = Number(jr.vacancies ?? 1)
  const acN = Number(jr.accepted_count ?? 0)

  return {
    ...base,
    edit: {
      rootCategoryId: resolvedRoot,
      categoryId: resolvedMid,
      subcategories: subRows ?? [],
      title: jobRow.title,
      titleEn: (jobRow as { title_en?: string | null }).title_en ?? "",
      subcategoryId: jobRow.subcategory_id ?? "",
      description: jobRow.description,
      descriptionEn: (jobRow as { description_en?: string | null }).description_en ?? "",
      isUrgent: jobRow.is_urgent,
      budgetType: jobRow.budget_type,
      budgetMin: jobRow.budget_min == null ? "" : String(jobRow.budget_min),
      budgetMax: jobRow.budget_max == null ? "" : String(jobRow.budget_max),
      durationType: jobRow.duration_type,
      locationType: jobRow.location_type,
      contactEmail: parsedContact.contactEmail,
      contactPhone: parsedContact.contactPhone,
      applicationDeadline: jobRow.application_deadline ? jobRow.application_deadline.slice(0, 10) : "",
      vacancies: Number.isFinite(vacN) && vacN >= 1 ? Math.floor(vacN) : 1,
      acceptedCountSnapshot: Number.isFinite(acN) && acN >= 0 ? Math.floor(acN) : 0,
      selectedSkillIds: jsRows?.map((r) => r.skill_id) ?? [],
      existingImageUrls: Array.isArray((jobRow as { image_urls?: unknown }).image_urls)
        ? (jobRow as { image_urls: unknown[] }).image_urls.map((v) => String(v)).filter(Boolean).slice(0, MAX_JOB_IMAGES)
        : [],
    },
  }
}
