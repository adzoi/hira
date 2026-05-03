import { isSupabaseConfigured, supabase } from "./supabase"

const META_PREFIX = "<!--gigori-meta:"
const META_SUFFIX = "-->"

function parseListingPreview(raw: string | null): { text: string; tags: string[] } {
  if (!raw) return { text: "", tags: [] }
  const fallbackTags: string[] = []
  let body = raw
  if (raw.startsWith(META_PREFIX)) {
    const endIndex = raw.indexOf(META_SUFFIX)
    if (endIndex >= 0) {
      const metaChunk = raw.slice(META_PREFIX.length, endIndex).trim()
      body = raw.slice(endIndex + META_SUFFIX.length).trimStart()
      try {
        const parsed = JSON.parse(metaChunk) as { tags?: unknown }
        if (Array.isArray(parsed.tags)) {
          for (const t of parsed.tags) {
            const s = String(t).trim()
            if (s && fallbackTags.length < 20) fallbackTags.push(s)
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  const oneLine = body.replace(/\s+/g, " ").trim()
  return { text: oneLine, tags: fallbackTags }
}

export type HomeFreelancerServiceItem = {
  kind: "freelancer_service"
  id: string
  createdAt: string
  title: string
  descriptionPreview: string
  priceNegotiable: boolean
  price: number
  deliveryDays: number
  freelancerSlug: string
  fullName: string
  professionalTitle: string
  avatarUrl: string | null
  averageRating: number
  tags: string[]
}

/** Open job posting (დამქირავებლის განცხადება) — არა პროფილი. */
export type HomeJobListingItem = {
  kind: "hirer_job"
  id: string
  createdAt: string
  title: string
  descriptionPreview: string
  companyName: string
  companyAvatar: string | null
  city: string | null
  categoryName: string
  subcategoryName: string | null
  budgetType: string
  budgetMin: number | null
  budgetMax: number | null
  locationType: string
  durationType: string
  isUrgent: boolean
  applicationDeadline: string | null
  applicantsCount: number
  skillNames: string[]
  hirerAverageRating: number
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
    title: "React პაკეტი — პატარა ფიჩერები",
    descriptionPreview: "ლეიაუთი, ფორმები და API ინტეგრაცია სწრაფად.",
    priceNegotiable: false,
    price: 450,
    deliveryDays: 5,
    freelancerSlug: "giorgi-beridze",
    fullName: "გიორგი ბერიძე",
    professionalTitle: "Full-Stack Developer",
    avatarUrl: null,
    averageRating: 4.8,
    tags: ["React", "TypeScript"],
  },
  {
    kind: "freelancer_service",
    id: "mock-s2",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    title: "UI/UX რევიუ (Figma)",
    descriptionPreview: "ინტერფეისის აუდიტი და რეკომენდაციები.",
    priceNegotiable: false,
    price: 280,
    deliveryDays: 3,
    freelancerSlug: "nino-kapanadze",
    fullName: "ნინო კაპანაძე",
    professionalTitle: "UI Designer",
    avatarUrl: null,
    averageRating: 4.9,
    tags: [],
  },
]

const MOCK_JOB_LISTINGS: HomeJobListingItem[] = [
  {
    kind: "hirer_job",
    id: "mock-job-1",
    createdAt: new Date(Date.now() - 43200000).toISOString(),
    title: "React Developer საჭიროა საპროექტო ჯგუფისთვის",
    descriptionPreview:
      "გამოცდილი React დეველოპერი კომერციული პროექტისთვის — კომპონენტები, მდგომარეობის მართვა და API.",
    companyName: "TechStart Georgia",
    companyAvatar: null,
    city: "თბილისი",
    categoryName: "პროგრამირება",
    subcategoryName: null,
    budgetType: "fixed",
    budgetMin: 800,
    budgetMax: 1200,
    locationType: "remote",
    durationType: "one_time",
    isUrgent: true,
    applicationDeadline: null,
    applicantsCount: 3,
    skillNames: ["React", "TypeScript"],
    hirerAverageRating: 4.7,
  },
  {
    kind: "hirer_job",
    id: "mock-job-2",
    createdAt: new Date(Date.now() - 72000000).toISOString(),
    title: "სოციალური მედიის კონტენტის სერია",
    descriptionPreview: "Instagram და Facebook პოსტები, სტორიები და მოკლე ვიდეო იდეები კვარტალურად.",
    companyName: "Café Leila",
    companyAvatar: null,
    city: "ბათუმი",
    categoryName: "მარკეტინგი",
    subcategoryName: null,
    budgetType: "monthly",
    budgetMin: 400,
    budgetMax: null,
    locationType: "anywhere",
    durationType: "ongoing",
    isUrgent: false,
    applicationDeadline: null,
    applicantsCount: 8,
    skillNames: ["Instagram", "კონტენტი"],
    hirerAverageRating: 4.5,
  },
]

async function aggregateHirerRatings(
  client: NonNullable<typeof supabase>,
  hirerUserIds: string[],
): Promise<Map<string, { sum: number; count: number }>> {
  const ratingTotals = new Map<string, { sum: number; count: number }>()
  if (hirerUserIds.length === 0) return ratingTotals

  const { data: reviewRows, error: revErr } = await client
    .from("reviews")
    .select("reviewee_id, rating_overall")
    .in("reviewee_id", hirerUserIds)

  if (revErr) {
    console.warn(revErr)
    return ratingTotals
  }

  for (const r of reviewRows ?? []) {
    const rid = String((r as { reviewee_id: string }).reviewee_id ?? "")
    if (!rid) continue
    const rating = Number((r as { rating_overall?: number }).rating_overall ?? 0)
    const prev = ratingTotals.get(rid) ?? { sum: 0, count: 0 }
    prev.sum += rating
    prev.count += 1
    ratingTotals.set(rid, prev)
  }

  return ratingTotals
}

function hirerRatingFromTotals(
  ownerUserId: string,
  ratingTotals: Map<string, { sum: number; count: number }>,
  fallbackFromProfile: number,
): number {
  const t = ratingTotals.get(ownerUserId)
  if (t && t.count > 0) return t.sum / t.count
  return Number(fallbackFromProfile ?? 0) || 0
}

/**
 * აქტიური ფრილანსერის სერვისები და გახსნილი სამუშაოები (დამქირავებლის განცხადებები) ერთ სიად.
 */
export async function loadHomeFeed(): Promise<HomeFeedItem[]> {
  if (!isSupabaseConfigured || !supabase) {
    return [...MOCK_SERVICES, ...MOCK_JOB_LISTINGS].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  }

  const [{ data: serviceRows, error: sErr }, { data: jobRows, error: jErr }] = await Promise.all([
    supabase
      .from("services")
      .select(
        `
        id,
        freelancer_profile_id,
        title,
        description,
        price,
        delivery_days,
        created_at,
        freelancer_profiles (
          slug,
          professional_title,
          is_public,
          average_rating,
          profiles:profiles!freelancer_profiles_user_id_fkey (
            full_name,
            avatar_url
          )
        )
      `,
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("jobs")
      .select(
        `
        id,
        created_at,
        title,
        description,
        budget_type,
        budget_min,
        budget_max,
        location_type,
        duration_type,
        is_urgent,
        application_deadline,
        hirer_profiles (
          user_id,
          company_name,
          average_rating_given,
          profiles:profiles!hirer_profiles_user_id_fkey (
            full_name,
            avatar_url,
            city
          )
        ),
        categories (name_ka),
        subcategories (name_ka),
        job_skills (
          skills (name)
        ),
        job_applications (id)
      `,
      )
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(80),
  ])

  if (sErr) console.warn(sErr)
  if (jErr) console.warn(jErr)

  const hirerUserIdsFromJobs = [
    ...new Set(
      (jobRows ?? [])
        .map((row: { hirer_profiles?: { user_id?: string | null } | null }) =>
          String(row.hirer_profiles?.user_id ?? "").trim(),
        )
        .filter(Boolean),
    ),
  ]

  const ratingTotals = await aggregateHirerRatings(supabase, hirerUserIdsFromJobs)

  const freelancerItems: HomeFreelancerServiceItem[] = []
  for (const row of serviceRows ?? []) {
    const fp = row.freelancer_profiles as unknown as null | {
      slug: string | null
      professional_title: string | null
      is_public: boolean | null
      average_rating: number | null
      profiles: null | { full_name: string | null; avatar_url: string | null }
    }
    if (!fp?.slug || fp.is_public === false) continue
    const parsed = parseListingPreview(row.description ?? null)
    const snippet =
      parsed.text.length > 120 ? `${parsed.text.slice(0, 120)}…` : parsed.text || "დეტალები ლისტინგის გვერდზე."
    const priceNum = Number(row.price ?? 0)
    const priceNegotiable = listingPriceNegotiable(priceNum, parsed.text)
    const prof = fp.profiles
    freelancerItems.push({
      kind: "freelancer_service",
      id: row.id,
      createdAt: row.created_at ?? new Date().toISOString(),
      title: row.title?.trim() || "სერვისი",
      descriptionPreview: snippet,
      priceNegotiable,
      price: priceNum,
      deliveryDays: Number(row.delivery_days ?? 0),
      freelancerSlug: fp.slug,
      fullName: prof?.full_name?.trim() || "ფრილანსერი",
      professionalTitle: fp.professional_title?.trim() || "",
      avatarUrl: prof?.avatar_url ?? null,
      averageRating: Number(fp.average_rating ?? 0),
      tags: parsed.tags,
    })
  }

  const jobItems: HomeJobListingItem[] = (jobRows ?? []).map((row: any) => {
    const hp = row.hirer_profiles as null | {
      user_id: string | null
      company_name: string | null
      average_rating_given: number | null
      profiles: null | { full_name: string | null; avatar_url: string | null; city: string | null }
    }
    const profile = hp?.profiles
    const companyName = hp?.company_name?.trim() || profile?.full_name?.trim() || "დამქირავებელი"
    const desc = String(row.description ?? "").replace(/\s+/g, " ").trim()
    const snippet = desc.length > 120 ? `${desc.slice(0, 120)}…` : desc || "დეტალები განცხადების გვერდზე."
    const skillsRaw = row.job_skills as Array<{ skills: null | { name: string } }> | undefined
    const skillNames = (skillsRaw ?? [])
      .map((x) => x.skills?.name?.trim())
      .filter((n): n is string => Boolean(n))
      .slice(0, 12)
    const apps = row.job_applications as unknown[] | undefined
    const ownerUid = String(hp?.user_id ?? "").trim()
    const ratingFallback = Number(hp?.average_rating_given ?? 0)

    return {
      kind: "hirer_job" as const,
      id: row.id as string,
      createdAt: row.created_at ?? new Date().toISOString(),
      title: row.title?.trim() || "სამუშაო",
      descriptionPreview: snippet,
      companyName,
      companyAvatar: profile?.avatar_url ?? null,
      city: profile?.city ?? null,
      categoryName: row.categories?.name_ka ?? "კატეგორია",
      subcategoryName: row.subcategories?.name_ka ?? null,
      budgetType: String(row.budget_type ?? "fixed"),
      budgetMin: row.budget_min != null ? Number(row.budget_min) : null,
      budgetMax: row.budget_max != null ? Number(row.budget_max) : null,
      locationType: String(row.location_type ?? "anywhere"),
      durationType: String(row.duration_type ?? "one_time"),
      isUrgent: Boolean(row.is_urgent),
      applicationDeadline: row.application_deadline ?? null,
      applicantsCount: Array.isArray(apps) ? apps.length : 0,
      skillNames,
      hirerAverageRating: ownerUid ? hirerRatingFromTotals(ownerUid, ratingTotals, ratingFallback) : 0,
    }
  })

  const merged = [...freelancerItems, ...jobItems]
  merged.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  return merged
}
