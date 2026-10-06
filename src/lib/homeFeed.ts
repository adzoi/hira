import { fetchHomeFeedPayload } from "./marketplaceEdge.ts"
import { isSupabaseConfigured, supabase } from "./supabase"
import { jobVacancyStats } from "./jobVacancies.ts"
import { jobVipIsActive } from "./vipStatus.ts"
import { parseListingPreview } from "./listingDescription.ts"

export type HomeFreelancerServiceItem = {
  kind: "freelancer_service"
  id: string
  createdAt: string
  title: string
  titleEn: string | null
  descriptionPreview: string
  descriptionEnPreview: string | null
  priceNegotiable: boolean
  price: number
  priceType: string
  freelancerSlug: string
  fullName: string
  professionalTitle: string
  avatarUrl: string | null
  averageRating: number
  viewsCount: number
  tags: string[]
  /** Active paid VIP placement for this listing. */
  vipFeatured: boolean
}

/** Open job posting (დამქირავებლის განცხადება) — არა პროფილი. */
export type HomeJobListingItem = {
  kind: "hirer_job"
  id: string
  createdAt: string
  title: string
  titleEn: string | null
  descriptionPreview: string
  descriptionEnPreview: string | null
  imagePath: string | null
  companyName: string
  companyAvatar: string | null
  city: string | null
  categoryNameKa: string
  categoryNameEn: string | null
  subcategoryNameKa: string | null
  subcategoryNameEn: string | null
  budgetType: string
  budgetMin: number | null
  budgetMax: number | null
  locationType: string
  durationType: string
  isUrgent: boolean
  applicationDeadline: string | null
  applicantsCount: number
  viewsCount: number
  skillNames: string[]
  hirerAverageRating: number
  /** Active paid VIP placement for this job posting. */
  vipFeatured: boolean
  vacancies: number
  acceptedCount: number
}

export type HomeFeedItem = HomeFreelancerServiceItem | HomeJobListingItem

export function listingPriceNegotiable(price: number, description: string): boolean {
  if (price === 0) return true
  return description.toLowerCase().includes("შეთანხმებით")
}

const MOCK_SERVICES: HomeFreelancerServiceItem[] = [
  {
    kind: "freelancer_service",
    id: "mock-s1",
    createdAt: new Date().toISOString(),
    title: "React პაკეტი - პატარა ფიჩერები",
    titleEn: null,
    descriptionPreview: "ლეიაუთი, ფორმები და API ინტეგრაცია სწრაფად.",
    descriptionEnPreview: null,
    priceNegotiable: false,
    price: 450,
    priceType: "fixed",
    freelancerSlug: "giorgi-beridze",
    fullName: "გიორგი ბერიძე",
    professionalTitle: "Full-Stack Developer",
    avatarUrl: null,
    averageRating: 4.8,
    viewsCount: 0,
    tags: ["React", "TypeScript"],
    vipFeatured: false,
  },
  {
    kind: "freelancer_service",
    id: "mock-s2",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    title: "UI/UX რევიუ (Figma)",
    titleEn: null,
    descriptionPreview: "ინტერფეისის აუდიტი და რეკომენდაციები.",
    descriptionEnPreview: null,
    priceNegotiable: false,
    price: 280,
    priceType: "fixed",
    freelancerSlug: "nino-kapanadze",
    fullName: "ნინო კაპანაძე",
    professionalTitle: "UI Designer",
    avatarUrl: null,
    averageRating: 4.9,
    viewsCount: 0,
    tags: [],
    vipFeatured: false,
  },
]

const MOCK_JOB_LISTINGS: HomeJobListingItem[] = [
  {
    kind: "hirer_job",
    id: "mock-job-1",
    createdAt: new Date(Date.now() - 43200000).toISOString(),
    title: "React Developer საჭიროა საპროექტო ჯგუფისთვის",
    titleEn: null,
    descriptionPreview:
      "გამოცდილი React დეველოპერი კომერციული პროექტისთვის - კომპონენტები, მდგომარეობის მართვა და API.",
    descriptionEnPreview: null,
    imagePath: null,
    companyName: "TechStart Georgia",
    companyAvatar: null,
    city: "თბილისი",
    categoryNameKa: "პროგრამირება",
    categoryNameEn: "Programming",
    subcategoryNameKa: null,
    subcategoryNameEn: null,
    budgetType: "fixed",
    budgetMin: 800,
    budgetMax: 1200,
    locationType: "remote",
    durationType: "one_time",
    isUrgent: true,
    applicationDeadline: null,
    applicantsCount: 3,
    viewsCount: 0,
    skillNames: ["React", "TypeScript"],
    hirerAverageRating: 4.7,
    vipFeatured: false,
    vacancies: 1,
    acceptedCount: 0,
  },
  {
    kind: "hirer_job",
    id: "mock-job-2",
    createdAt: new Date(Date.now() - 72000000).toISOString(),
    title: "სოციალური მედიის კონტენტის სერია",
    titleEn: null,
    descriptionPreview: "Instagram და Facebook პოსტები, სტორიები და მოკლე ვიდეო იდეები კვარტალურად.",
    descriptionEnPreview: null,
    imagePath: null,
    companyName: "Café Leila",
    companyAvatar: null,
    city: "ბათუმი",
    categoryNameKa: "მარკეტინგი",
    categoryNameEn: "Marketing",
    subcategoryNameKa: null,
    subcategoryNameEn: null,
    budgetType: "monthly",
    budgetMin: 400,
    budgetMax: null,
    locationType: "anywhere",
    durationType: "ongoing",
    isUrgent: false,
    applicationDeadline: null,
    applicantsCount: 8,
    viewsCount: 0,
    skillNames: ["Instagram", "კონტენტი"],
    hirerAverageRating: 4.5,
    vipFeatured: false,
    vacancies: 3,
    acceptedCount: 1,
  },
]

function normalizeSkillNames(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const x of raw) {
    const s = String(x ?? "").trim()
    if (s && out.length < max) out.push(s)
  }
  return out
}

/** Prefer RPC `hirer_average_rating` (reviews avg, then hirer_profiles fallback); other keys stay for compatibility. */
function hirerRatingFromJobRow(row: Record<string, unknown>): number | null {
  const keys = ["hirer_average_rating", "average_rating_received", "average_rating", "average_rating_given"] as const
  for (const key of keys) {
    const v = row[key]
    if (v === null || v === undefined || v === "") continue
    const n = typeof v === "number" ? v : Number(v)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

function serviceVipFeatured(row: Record<string, unknown>): boolean {
  return (
    row.is_vip === true &&
    Boolean(row.vip_expires_at) &&
    new Date(String(row.vip_expires_at)) > new Date()
  )
}

/**
 * აქტიური ფრილანსერის სერვისები და გახსნილი სამუშაოები (დამქირავებლის განცხადებები) ერთ სიად.
 */
export async function loadHomeFeed(): Promise<HomeFeedItem[]> {
  if (!isSupabaseConfigured || !supabase) {
    return [...MOCK_SERVICES, ...MOCK_JOB_LISTINGS].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  }

  const payload = (await fetchHomeFeedPayload()) as null | { services?: unknown[]; jobs?: unknown[] }
  const serviceRows = Array.isArray(payload?.services) ? payload!.services! : []
  const jobRows = Array.isArray(payload?.jobs) ? payload!.jobs! : []

  const freelancerItems: HomeFreelancerServiceItem[] = []
  for (const raw of serviceRows) {
    const row = raw as Record<string, unknown>
    if (row.is_public === false) continue
    const slug = String(row.slug ?? "").trim()
    if (!slug) continue

    const parsed = parseListingPreview((row.description as string | null) ?? null)
    const snippet =
      parsed.text.length > 120 ? `${parsed.text.slice(0, 120)}…` : parsed.text || "დეტალები ლისტინგის გვერდზე."
    const priceNum = Number(row.price ?? 0)
    const priceNegotiable = listingPriceNegotiable(priceNum, parsed.text)
    const descriptionEnRaw = String(row.description_en ?? "").replace(/\s+/g, " ").trim()
    const descriptionEnPreview =
      descriptionEnRaw.length > 120 ? `${descriptionEnRaw.slice(0, 120)}…` : descriptionEnRaw || null
    freelancerItems.push({
      kind: "freelancer_service",
      id: String(row.id ?? ""),
      createdAt: String(row.created_at ?? new Date().toISOString()),
      title: String(row.title ?? "").trim() || "სერვისი",
      titleEn: String(row.title_en ?? "").trim() || null,
      descriptionPreview: snippet,
      descriptionEnPreview,
      priceNegotiable,
      price: priceNum,
      priceType: String(row.price_type ?? "fixed"),
      freelancerSlug: slug,
      fullName: String(row.full_name ?? "").trim() || "ფრილანსერი",
      professionalTitle: String(row.professional_title ?? "").trim(),
      avatarUrl: row.avatar_url != null ? String(row.avatar_url) : null,
      averageRating: Number(row.average_rating ?? 0),
      viewsCount: Number(row.views_count ?? 0),
      tags: normalizeSkillNames(row.skill_names, 20),
      vipFeatured: serviceVipFeatured(row),
    })
  }

  const jobItems: HomeJobListingItem[] = jobRows.map((raw) => {
    const row = raw as Record<string, unknown>
    const desc = String(row.description ?? "").replace(/\s+/g, " ").trim()
    const snippet = desc.length > 120 ? `${desc.slice(0, 120)}…` : desc || "დეტალები განცხადების გვერდზე."
    const descriptionEnRaw = String(row.description_en ?? "").replace(/\s+/g, " ").trim()
    const descriptionEnPreview =
      descriptionEnRaw.length > 120 ? `${descriptionEnRaw.slice(0, 120)}…` : descriptionEnRaw || null
    const imagePaths = Array.isArray(row.image_urls)
      ? (row.image_urls as unknown[]).map((v) => String(v)).filter(Boolean)
      : []
    const imagePathFlat = row.image_path != null ? String(row.image_path) : null
    const companyName =
      String(row.company_name ?? "").trim() ||
      String(row.full_name ?? "").trim() ||
      "დამქირავებელი"
    const vac = jobVacancyStats(row.vacancies as number | null | undefined, row.accepted_count as number | null | undefined)
    const skillNames = normalizeSkillNames(row.skill_names, 12)

    const rowRating = hirerRatingFromJobRow(row)

    return {
      kind: "hirer_job" as const,
      id: String(row.id ?? ""),
      createdAt: String(row.created_at ?? new Date().toISOString()),
      title: String(row.title ?? "").trim() || "სამუშაო",
      titleEn: String(row.title_en ?? "").trim() || null,
      descriptionPreview: snippet,
      descriptionEnPreview,
      imagePath: imagePaths[0] ?? imagePathFlat,
      companyName,
      companyAvatar: row.avatar_url != null ? String(row.avatar_url) : null,
      city: row.city != null ? String(row.city) : null,
      categoryNameKa:
        String(row.category_name_ka ?? row.category_name ?? "").trim() || "კატეგორია",
      categoryNameEn:
        row.category_name_en != null ? String(row.category_name_en).trim() || null : null,
      subcategoryNameKa:
        row.subcategory_name_ka != null
          ? String(row.subcategory_name_ka).trim() || null
          : row.subcategory_name != null
            ? String(row.subcategory_name).trim() || null
            : null,
      subcategoryNameEn:
        row.subcategory_name_en != null ? String(row.subcategory_name_en).trim() || null : null,
      budgetType: String(row.budget_type ?? "fixed"),
      budgetMin: row.budget_min != null ? Number(row.budget_min) : null,
      budgetMax: row.budget_max != null ? Number(row.budget_max) : null,
      locationType: String(row.location_type ?? "anywhere"),
      durationType: String(row.duration_type ?? "one_time"),
      isUrgent: Boolean(row.is_urgent),
      applicationDeadline: row.application_deadline != null ? String(row.application_deadline) : null,
      applicantsCount: Number(row.applicants_count ?? 0),
      viewsCount: Number(row.views_count ?? 0),
      skillNames,
      hirerAverageRating: rowRating ?? 0,
      vipFeatured: jobVipIsActive(Boolean(row.is_vip), row.vip_expires_at != null ? String(row.vip_expires_at) : null),
      vacancies: vac.vacancies,
      acceptedCount: vac.acceptedCount,
    }
  })

  jobItems.sort((a, b) => {
    const v = (b.vipFeatured ? 1 : 0) - (a.vipFeatured ? 1 : 0)
    if (v !== 0) return v
    return +new Date(b.createdAt) - +new Date(a.createdAt)
  })

  const merged = [...freelancerItems, ...jobItems]
  merged.sort((a, b) => {
    const av = a.kind === "hirer_job" ? (a.vipFeatured ? 1 : 0) : (a.vipFeatured ? 1 : 0)
    const bv = b.kind === "hirer_job" ? (b.vipFeatured ? 1 : 0) : (b.vipFeatured ? 1 : 0)
    const v = bv - av
    if (v !== 0) return v
    return +new Date(b.createdAt) - +new Date(a.createdAt)
  })
  return merged
}
