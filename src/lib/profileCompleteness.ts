import type { Database } from "./database.types"

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
type FreelancerProfileRow = Database["public"]["Tables"]["freelancer_profiles"]["Row"]

export type ProfileCompletenessCounts = {
  skills: number
  activeServices: number
  experience: number
  education: number
}

export type ProfileCompletenessItemId =
  | "avatar"
  | "title"
  | "bio"
  | "skills"
  | "service"
  | "experience"
  | "education"
  | "languages"
  | "city"
  | "links"

export type ProfileCompletenessItem = {
  id: ProfileCompletenessItemId
  /** Share of the 100% total this item is worth. */
  weight: number
  done: boolean
  /** Where the user goes to fix it. */
  href: string
}

export const MIN_BIO_LENGTH = 80
export const MIN_SKILLS = 3

const hasText = (value: string | null | undefined) => Boolean(value?.trim())

/**
 * Weighted checklist for a freelancer's public profile. Weights sum to 100 and favour
 * what hirers look at first (photo, bio, skills, a published service).
 */
export function profileCompletenessItems(
  profile: Pick<ProfileRow, "avatar_url" | "city">,
  freelancer: FreelancerProfileRow,
  counts: ProfileCompletenessCounts,
): ProfileCompletenessItem[] {
  const hasAnyLink = [
    freelancer.portfolio_url,
    freelancer.linkedin_url,
    freelancer.github_url,
    freelancer.facebook_url,
    freelancer.instagram_url,
    freelancer.tiktok_url,
    freelancer.youtube_url,
    freelancer.x_url,
  ].some(hasText)

  return [
    { id: "avatar", weight: 15, done: hasText(profile.avatar_url), href: "/profile" },
    { id: "title", weight: 10, done: hasText(freelancer.professional_title), href: "/profile" },
    { id: "bio", weight: 15, done: (freelancer.bio?.trim().length ?? 0) >= MIN_BIO_LENGTH, href: "/profile" },
    { id: "skills", weight: 15, done: counts.skills >= MIN_SKILLS, href: "/profile" },
    { id: "service", weight: 15, done: counts.activeServices > 0, href: "/listing/new?from=profile" },
    { id: "experience", weight: 10, done: counts.experience > 0, href: "/profile" },
    { id: "education", weight: 5, done: counts.education > 0, href: "/profile" },
    { id: "languages", weight: 5, done: (freelancer.languages?.length ?? 0) > 0, href: "/profile" },
    { id: "city", weight: 5, done: hasText(profile.city), href: "/profile" },
    { id: "links", weight: 5, done: hasAnyLink, href: "/profile" },
  ]
}

export function profileCompletenessPercent(items: ProfileCompletenessItem[]): number {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  const done = items.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0)
  return total === 0 ? 100 : Math.round((done / total) * 100)
}
