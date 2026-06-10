import { Helmet } from "react-helmet-async"
import type { FreelancerData, ProfileData, SkillData } from "./queries/fetchFreelancerProfile.ts"
import type { JobData } from "./queries/fetchJobDetail.ts"
import { formatCityForDisplay } from "./marketplaceFilters.ts"
import { normalizeListingPriceType } from "./listingPrice.ts"
import { SITE_BASE_URL } from "./usePageMeta.tsx"

type JsonLdValue = Record<string, unknown> | Record<string, unknown>[]

export function JsonLd({ data }: { data: JsonLdValue | null | undefined }) {
  if (!data) return null

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(data)}</script>
    </Helmet>
  )
}

function plainText(value: string, maxLength = 5000): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength)
}

function toIsoDate(value: string | null | undefined): string | undefined {
  if (!value?.trim()) return undefined
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return undefined
  return parsed.toISOString()
}

function salaryUnitText(budgetType: string): string {
  const type = normalizeListingPriceType(budgetType)
  if (type === "hourly") return "HOUR"
  if (type === "monthly") return "MONTH"
  return "PROJECT"
}

function buildBaseSalary(job: JobData): Record<string, unknown> | undefined {
  const min = job.budget_min ?? job.budget_max
  const max = job.budget_max ?? job.budget_min
  if (min == null && max == null) return undefined

  const value: Record<string, unknown> = {
    "@type": "QuantitativeValue",
    unitText: salaryUnitText(job.budget_type),
  }

  if (min != null) value.minValue = min
  if (max != null) value.maxValue = max
  if (min != null && max != null && min === max) {
    value.value = min
    delete value.minValue
    delete value.maxValue
  }

  return {
    "@type": "MonetaryAmount",
    currency: "GEL",
    value,
  }
}

function buildJobLocation(job: JobData): Record<string, unknown> {
  const locality =
    job.location_type === "tbilisi"
      ? "Tbilisi"
      : formatCityForDisplay(job.hirer_city) ?? undefined

  return {
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      ...(locality ? { addressLocality: locality } : {}),
      addressCountry: "GE",
    },
  }
}

function isTelecommuteLocation(locationType: string): boolean {
  return locationType === "remote" || locationType === "anywhere"
}

type BuildJobPostingInput = {
  job: JobData
  title: string
  description: string
}

export function buildJobPostingStructuredData({
  job,
  title,
  description,
}: BuildJobPostingInput): Record<string, unknown> | null {
  if (job.status !== "open") return null

  const pageUrl = `${SITE_BASE_URL}/job/${encodeURIComponent(job.id)}`
  const posted = toIsoDate(job.created_at)
  if (!posted) return null

  const structured: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: plainText(title, 200),
    description: plainText(description),
    identifier: {
      "@type": "PropertyValue",
      name: "Hira",
      value: job.id,
    },
    url: pageUrl,
    directApply: true,
    datePosted: posted,
    hiringOrganization: {
      "@type": "Organization",
      name: plainText(job.hirer_company_name, 200),
    },
    jobLocation: buildJobLocation(job),
    applicantLocationRequirements: {
      "@type": "Country",
      name: "Georgia",
    },
    employmentType: "CONTRACTOR",
  }

  const validThrough = toIsoDate(job.application_deadline)
  if (validThrough) structured.validThrough = validThrough

  if (isTelecommuteLocation(job.location_type)) {
    structured.jobLocationType = "TELECOMMUTE"
  }

  const category = job.subcategory_name_en ?? job.subcategory_name_ka ?? job.category_name_en ?? job.category_name_ka
  if (category) structured.occupationalCategory = plainText(category, 200)

  if (job.skills.length > 0) {
    structured.skills = job.skills.map((skill) => skill.name).slice(0, 20).join(", ")
  }

  const baseSalary = buildBaseSalary(job)
  if (baseSalary) structured.baseSalary = baseSalary

  return structured
}

function collectSameAsLinks(freelancer: FreelancerData): string[] {
  const urls = [
    freelancer.linkedin_url,
    freelancer.github_url,
    freelancer.portfolio_url,
    freelancer.facebook_url,
    freelancer.instagram_url,
    freelancer.tiktok_url,
    freelancer.youtube_url,
    freelancer.x_url,
  ]

  return urls
    .map((url) => url?.trim())
    .filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url)))
}

type BuildPersonInput = {
  profile: ProfileData
  freelancer: FreelancerData
  skills: SkillData[]
  avatarUrl?: string | null
}

export function buildPersonStructuredData({
  profile,
  freelancer,
  skills,
  avatarUrl,
}: BuildPersonInput): Record<string, unknown> {
  const pageUrl = `${SITE_BASE_URL}/freelancer/${encodeURIComponent(freelancer.slug)}`
  const structured: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: plainText(profile.full_name, 200),
    url: pageUrl,
  }

  const jobTitle = freelancer.professional_title?.trim()
  if (jobTitle) structured.jobTitle = plainText(jobTitle, 200)

  const bio = freelancer.bio?.trim()
  if (bio) structured.description = plainText(bio)

  const city = formatCityForDisplay(profile.city)
  if (city) {
    structured.homeLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: city,
        addressCountry: "GE",
      },
    }
  }

  const image = avatarUrl?.trim() || profile.avatar_url?.trim()
  if (image && /^https?:\/\//i.test(image)) {
    structured.image = image
  }

  const sameAs = collectSameAsLinks(freelancer)
  if (sameAs.length > 0) structured.sameAs = sameAs

  const knowsAbout = skills.map((skill) => skill.name).filter(Boolean).slice(0, 20)
  if (knowsAbout.length > 0) structured.knowsAbout = knowsAbout

  if (freelancer.languages.length > 0) {
    structured.knowsLanguage = freelancer.languages.slice(0, 10)
  }

  if (freelancer.total_reviews_count > 0 && freelancer.average_rating > 0) {
    structured.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(freelancer.average_rating.toFixed(1)),
      reviewCount: freelancer.total_reviews_count,
      bestRating: 5,
      worstRating: 1,
    }
  }

  return structured
}
