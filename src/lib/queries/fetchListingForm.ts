import { META_SUFFIX, resolveListingMetaPrefix, stripLegacyPricePrefix } from "../listingDescription.ts"
import { normalizeListingPriceType } from "../listingPrice.ts"
import {
  categoryIdsWithChildren,
  rootIdContainingCategory,
  type CategoryBranchRow,
} from "../marketplaceCategoryTree.ts"
import { formatSupabaseClientError, isSupabaseConfigured, supabase } from "../supabase.ts"

const MAX_LISTING_IMAGES = 3

type ListingMeta = {
  categoryId: string | null
  subcategoryId: string | null
  tags: string[]
}

function parseListingDescription(raw: string | null): { description: string; meta: ListingMeta } {
  const fallback: ListingMeta = { categoryId: null, subcategoryId: null, tags: [] }
  if (!raw) return { description: "", meta: fallback }
  const metaPrefix = resolveListingMetaPrefix(raw)
  if (!metaPrefix) return { description: stripLegacyPricePrefix(raw), meta: fallback }
  const endIndex = raw.indexOf(META_SUFFIX)
  if (endIndex < 0) return { description: stripLegacyPricePrefix(raw), meta: fallback }
  const metaChunk = raw.slice(metaPrefix.length, endIndex).trim()
  const body = stripLegacyPricePrefix(raw.slice(endIndex + META_SUFFIX.length))
  try {
    const parsed = JSON.parse(metaChunk) as Partial<ListingMeta>
    return {
      description: body,
      meta: {
        categoryId: parsed.categoryId ?? null,
        subcategoryId: parsed.subcategoryId ?? null,
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20)
          : [],
      },
    }
  } catch {
    return { description: stripLegacyPricePrefix(raw), meta: fallback }
  }
}

export type TagOption = {
  name: string
  categoryId: string | null
}

export type ListingFormEditData = {
  title: string
  titleEn: string
  description: string
  descriptionEn: string
  price: string
  priceType: ReturnType<typeof normalizeListingPriceType>
  isActive: boolean
  rootCategoryId: string
  categoryId: string
  subcategoryId: string
  tags: string[]
  existingImageUrls: string[]
}

/** Starting point for a new listing, built from the freelancer's own profile. */
export type ListingProfileDraft = {
  title: string
  bio: string
  skills: string[]
  rootCategoryId: string
  categoryId: string
  tags: string[]
}

export type ListingFormQueryData = {
  userId: string
  freelancerProfileId: string
  categories: CategoryBranchRow[]
  availableTags: TagOption[]
  edit?: ListingFormEditData
  profileDraft?: ListingProfileDraft
  redirectTo?: string
}

/** Root + mid category ids for a stored mid-level category id. */
function resolveCategoryPath(fullCats: CategoryBranchRow[], mid: string): { root: string; mid: string } {
  if (!mid) return { root: "", mid: "" }
  const node = fullCats.find((c) => c.id === mid)
  if (node?.parent_id) return { root: rootIdContainingCategory(fullCats, mid), mid }
  if (categoryIdsWithChildren(fullCats).has(mid)) return { root: mid, mid: "" }
  return { root: mid, mid }
}

async function fetchProfileDraft(freelancerProfileId: string, fullCats: CategoryBranchRow[]): Promise<ListingProfileDraft | undefined> {
  if (!supabase) return undefined
  const [{ data: fp }, { data: skillRows }] = await Promise.all([
    supabase.from("freelancer_profiles").select("professional_title,bio").eq("id", freelancerProfileId).maybeSingle(),
    supabase.from("freelancer_skills").select("skills(name,category_id)").eq("freelancer_profile_id", freelancerProfileId),
  ])
  const skills = ((skillRows ?? []) as Array<{ skills: { name?: string | null; category_id?: string | null } | null }>)
    .map((row) => ({ name: String(row.skills?.name ?? "").trim(), categoryId: row.skills?.category_id ?? null }))
    .filter((row) => row.name)

  // The category most of the freelancer's skills belong to.
  const counts = new Map<string, number>()
  for (const skill of skills) {
    if (skill.categoryId) counts.set(skill.categoryId, (counts.get(skill.categoryId) ?? 0) + 1)
  }
  const topCategory = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
  const path = resolveCategoryPath(fullCats, topCategory)

  const title = String(fp?.professional_title ?? "").trim()
  const bio = String(fp?.bio ?? "").trim()
  if (!title && !bio && skills.length === 0) return undefined
  return {
    title,
    bio,
    skills: skills.map((s) => s.name),
    rootCategoryId: path.root,
    categoryId: path.mid,
    tags: topCategory ? skills.filter((s) => s.categoryId === topCategory).map((s) => s.name) : [],
  }
}

export async function fetchListingForm(listingId?: string): Promise<ListingFormQueryData> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase არ არის კონფიგურირებული.")
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return {
      userId: "",
      freelancerProfileId: "",
      categories: [],
      availableTags: [],
      redirectTo: "/login?reason=listing",
    }
  }

  const [{ data: fp, error: fpError }, { data: categoryRows, error: categoryError }] = await Promise.all([
    supabase.from("freelancer_profiles").select("id").eq("user_id", user.id).maybeSingle(),
    supabase.from("categories").select("id,name_ka,name_en,parent_id,slug").eq("is_active", true).order("sort_order"),
  ])

  if (fpError || !fp) throw new Error("ფრილანსერის პროფილი ვერ მოიძებნა.")
  if (categoryError) throw categoryError

  const fullCats = (categoryRows ?? []).map(
    (row: {
      id?: string
      name_ka?: string
      name_en?: string | null
      parent_id?: string | null
      slug?: string | null
    }) => ({
      id: String(row.id ?? ""),
      name_ka: String(row.name_ka ?? ""),
      name_en: row.name_en ?? null,
      parent_id: row.parent_id ?? null,
      slug: row.slug ?? null,
    }),
  ) as CategoryBranchRow[]

  const { data: skillRows, error: skillError } = await supabase
    .from("skills")
    .select("name,category_id")
    .eq("is_approved", true)
    .order("name")

  const availableTags: TagOption[] = skillError
    ? (import.meta.env.DEV && console.warn("[ListingForm] skills catalog:", skillError), [])
    : Array.from(
        new Map(
          (skillRows ?? [])
            .map((row: { name?: string | null; category_id?: string | null }) => ({
              name: String(row.name ?? "").trim(),
              categoryId: row.category_id ?? null,
            }))
            .filter((row) => row.name)
            .map((row) => [`${row.name}::${row.categoryId ?? "none"}`, row]),
        ).values(),
      )

  const base: ListingFormQueryData = {
    userId: user.id,
    freelancerProfileId: fp.id,
    categories: fullCats,
    availableTags,
  }

  if (!listingId) {
    const profileDraft = await fetchProfileDraft(fp.id, fullCats).catch(() => undefined)
    return { ...base, profileDraft }
  }

  const { data: listing, error: listingError } = await supabase
    .from("services")
    .select("*")
    .eq("id", listingId)
    .eq("freelancer_profile_id", fp.id)
    .single()
  if (listingError || !listing) throw new Error("ლისტინგი ვერ მოიძებნა.")

  const parsed = parseListingDescription(listing.description ?? "")

  let resolvedMid = parsed.meta.categoryId ?? ""
  const parsedSub = parsed.meta.subcategoryId ?? ""
  const byId = new Map(fullCats.map((c) => [c.id, c]))
  if (resolvedMid && parsedSub) {
    const initialNode = byId.get(resolvedMid)
    if (initialNode && initialNode.parent_id == null) {
      const { data: subRow } = await supabase.from("subcategories").select("category_id").eq("id", parsedSub).maybeSingle()
      if (subRow?.category_id) resolvedMid = subRow.category_id
    }
  }
  const hasKids = categoryIdsWithChildren(fullCats)
  let resolvedRoot = ""
  if (resolvedMid) {
    const node = byId.get(resolvedMid)
    if (node?.parent_id) {
      resolvedRoot = rootIdContainingCategory(fullCats, resolvedMid)
    } else if (hasKids.has(resolvedMid)) {
      resolvedRoot = resolvedMid
      resolvedMid = ""
    } else {
      resolvedRoot = resolvedMid
    }
  }

  return {
    ...base,
    edit: {
      title: listing.title ?? "",
      titleEn: (listing as { title_en?: string | null }).title_en ?? "",
      description: parsed.description,
      descriptionEn: (listing as { description_en?: string | null }).description_en ?? "",
      price: String(listing.price ?? 0),
      priceType: normalizeListingPriceType((listing as { price_type?: string | null }).price_type),
      isActive: listing.is_active ?? true,
      rootCategoryId: resolvedRoot,
      categoryId: resolvedMid,
      subcategoryId: parsedSub,
      tags: parsed.meta.tags,
      existingImageUrls: Array.isArray((listing as { image_urls?: unknown }).image_urls)
        ? (listing as { image_urls: unknown[] }).image_urls.map((v) => String(v)).filter(Boolean).slice(0, MAX_LISTING_IMAGES)
        : [],
    },
  }
}

export function listingFormFetchErrorMessage(error: unknown): string {
  return formatSupabaseClientError(error, "ჩატვირთვა ვერ მოხერხდა.")
}
