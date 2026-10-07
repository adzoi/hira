import { normalizeListingPriceType } from "../listingPrice.ts"
import { jobVipIsActive } from "../vipStatus.ts"
import { isSupabaseConfigured, supabase } from "../supabase.ts"

export type ListingDetail = {
  id: string
  freelancerProfileId: string
  title: string
  titleEn: string | null
  descriptionRaw: string | null
  descriptionEn: string | null
  price: number
  priceType: string
  createdAt: string
  imageUrls: string[]
  fullName: string
  professionalTitle: string
  avatarUrl: string | null
  freelancerSlug: string
  freelancerUserId: string
  averageRating: number
  viewsCount: number
  isAcceptingNewWork: boolean
  vipExpiresAt: string | null
  vipActive: boolean
}

export async function fetchListingDetail(id: string): Promise<ListingDetail> {
  if (!id) throw new Error("ლისტინგი ვერ მოიძებნა.")
  if (!isSupabaseConfigured || !supabase) throw new Error("მონაცემთა ბაზა არ არის კონფიგურირებული.")

  const { data, error: qErr } = await supabase
    .from("services")
    .select(
      `
            id,
            freelancer_profile_id,
            title,
            title_en,
            description,
            description_en,
            price,
            price_type,
            views_count,
            created_at,
            is_vip,
            vip_expires_at,
            image_urls,
            freelancer_profiles (
              slug,
              professional_title,
              average_rating,
              is_accepting_new_work,
              profiles:profiles!freelancer_profiles_user_id_fkey (
                id,
                full_name,
                avatar_url
              )
            )
          `,
    )
    .eq("id", id)
    .eq("is_active", true)
    .single()
  if (qErr || !data) throw new Error("ლისტინგი ვერ მოიძებნა.")

  const fpJoined = data.freelancer_profiles as unknown
  const fp = (Array.isArray(fpJoined) ? fpJoined[0] : fpJoined) as {
    slug: string | null
    professional_title: string | null
    average_rating: number | null
    is_accepting_new_work?: boolean | null
    profiles: { id: string; full_name: string | null; avatar_url: string | null } | null
  } | null
  if (!fp?.slug) throw new Error("ლისტინგი ვერ მოიძებნა.")

  const vipExpiresAt = (data as { vip_expires_at?: string | null }).vip_expires_at ?? null
  return {
    vipExpiresAt,
    vipActive: jobVipIsActive(Boolean((data as { is_vip?: boolean | null }).is_vip), vipExpiresAt) && vipExpiresAt != null,
    id: data.id,
    freelancerProfileId: String(data.freelancer_profile_id ?? ""),
    title: data.title ?? "სერვისი",
    titleEn: (data as { title_en?: string | null }).title_en ?? null,
    descriptionRaw: data.description,
    descriptionEn: (data as { description_en?: string | null }).description_en ?? null,
    price: Number(data.price ?? 0),
    priceType: normalizeListingPriceType((data as { price_type?: string | null }).price_type),
    createdAt: data.created_at ?? new Date().toISOString(),
    imageUrls: Array.isArray((data as { image_urls?: unknown }).image_urls)
      ? ((data as { image_urls: unknown[] }).image_urls.map((x) => String(x)).filter(Boolean).slice(0, 3))
      : [],
    fullName: fp.profiles?.full_name?.trim() || "ფრილანსერი",
    professionalTitle: fp.professional_title?.trim() || "ფრილანსერი",
    avatarUrl: fp.profiles?.avatar_url ?? null,
    freelancerSlug: fp.slug,
    freelancerUserId: String(fp.profiles?.id ?? ""),
    averageRating: Number(fp.average_rating ?? 0),
    viewsCount: Number((data as { views_count?: number | null }).views_count ?? 0),
    isAcceptingNewWork: fp.is_accepting_new_work !== false,
  }
}
