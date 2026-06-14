import { formatFreelancerEducationDegreeLevel } from "./freelancerEducation.ts"

/** Validation / placeholder copy that must never appear as CV summary text. */
const CV_SUMMARY_PLACEHOLDER_RE =
  /ბიო\s+უნდა\s+(?:იყოს\s+მინიმუმ|შეიცავდეს\s+მინიმუმ)\s+\d+\s+სიმბოლ(?:ო(?:ს)?)\.?/gi

export function sanitizeCvProfessionalSummary(raw: string | null | undefined): string {
  const text = String(raw ?? "")
    .replace(CV_SUMMARY_PLACEHOLDER_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text
}

const KA_MONTHS = [
  "იანვარი",
  "თებერვალი",
  "მარტი",
  "აპრილი",
  "მაისი",
  "ივნისი",
  "ივლისი",
  "აგვისტო",
  "სექტემბერი",
  "ოქტომბერი",
  "ნოემბერი",
  "დეკემბერი",
] as const

/** Format YYYY-MM-DD (or parseable date) → "იანვარი 2024" */
export function formatGeorgianMonthYear(isoLike: string | null | undefined): string {
  if (!isoLike || !String(isoLike).trim()) return ""
  const d = new Date(String(isoLike).slice(0, 10) + "T12:00:00")
  if (Number.isNaN(d.getTime())) return ""
  const m = KA_MONTHS[d.getMonth()]
  const y = d.getFullYear()
  return `${m} ${y}`
}

export function formatGeorgianExperienceRange(
  start: string | null | undefined,
  end: string | null | undefined,
  isCurrent: boolean,
): string {
  const startTxt = formatGeorgianMonthYear(start ?? "")
  const endTxt = isCurrent || !end ? "დღემდე" : formatGeorgianMonthYear(end)
  if (startTxt && endTxt) return `${startTxt} - ${endTxt}`
  return startTxt || endTxt || ""
}

export function stripUrlForDisplay(url: string): string {
  return String(url)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
}

export function initialsFromName(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase()
}

export type CvWorkRow = {
  role: string
  company: string
  start_date: string
  end_date: string
  is_current: boolean
  description: string
}

export type CvEducationRow = {
  school: string
  degree: string
  field_of_study: string
  end_date: string
}

export type BuiltCv = Record<string, unknown> & {
  full_name: string
  email: string
  phone: string
  location: string
  linkedin_url: string
  github_url: string
  portfolio_url: string
  avatar_url: string
  hourly_rate: number | null
  professional_summary: string
  technical_skills: string[]
  languages: string[]
  soft_skills: string[]
  work_experience: CvWorkRow[]
  education: CvEducationRow[]
}

export function mergeSavedCv(profileCv: BuiltCv, saved: Record<string, unknown> | null | undefined): BuiltCv {
  if (!saved || typeof saved !== "object" || !String((saved as { id?: string }).id ?? "").trim()) {
    return profileCv
  }
  const s = saved as Record<string, unknown>
  const pickStr = (k: string, fallback: string) =>
    typeof s[k] === "string" ? (s[k] as string) : fallback
  const pickArrStr = (k: string, fallback: string[]) => {
    if (!Array.isArray(s[k])) return fallback
    const mapped = (s[k] as unknown[]).map((x) => String(x).trim()).filter(Boolean)
    return mapped.length > 0 ? mapped : fallback
  }
  const savedSummary = sanitizeCvProfessionalSummary(
    typeof s.professional_summary === "string" ? s.professional_summary : "",
  )
  const savedWork = Array.isArray(s.work_experience) ? (s.work_experience as CvWorkRow[]) : null
  const savedEducation = Array.isArray(s.education) ? (s.education as CvEducationRow[]) : null
  return {
    ...profileCv,
    full_name: pickStr("full_name", profileCv.full_name),
    email: pickStr("email", profileCv.email),
    phone: pickStr("phone", profileCv.phone),
    location: pickStr("location", profileCv.location),
    linkedin_url: pickStr("linkedin_url", profileCv.linkedin_url),
    github_url: pickStr("github_url", profileCv.github_url),
    portfolio_url: pickStr("portfolio_url", profileCv.portfolio_url),
    avatar_url: pickStr("avatar_url", profileCv.avatar_url),
    hourly_rate:
      typeof s.hourly_rate === "number" && !Number.isNaN(s.hourly_rate)
        ? s.hourly_rate
        : s.hourly_rate != null && String(s.hourly_rate).trim() !== ""
          ? Number(s.hourly_rate)
          : profileCv.hourly_rate,
    professional_summary: savedSummary || profileCv.professional_summary,
    technical_skills: pickArrStr("technical_skills", profileCv.technical_skills),
    languages: pickArrStr("languages", profileCv.languages),
    work_experience: savedWork && savedWork.length > 0 ? savedWork : profileCv.work_experience,
    education: savedEducation && savedEducation.length > 0 ? savedEducation : profileCv.education,
    soft_skills: pickArrStr("soft_skills", profileCv.soft_skills ?? []),
    custom_slug: typeof s.custom_slug === "string" ? s.custom_slug : (profileCv as { custom_slug?: string }).custom_slug,
    is_public: typeof s.is_public === "boolean" ? s.is_public : (profileCv as { is_public?: boolean }).is_public,
    id: (saved as { id?: string }).id,
  } as BuiltCv & { id?: string; custom_slug?: string; is_public?: boolean }
}

type FpRow = Record<string, unknown> | null
type ProfileRow = Record<string, unknown> | null

export function buildCvFromProfileData(input: {
  freelancerProfile: FpRow
  profile: ProfileRow
  experienceRows: Array<Record<string, unknown>>
  educationRows: Array<Record<string, unknown>>
  skillNames: string[]
  savedCv?: Record<string, unknown> | null
}): BuiltCv & { id?: string; custom_slug?: string; is_public?: boolean } {
  const fp = input.freelancerProfile ?? {}
  const pr = input.profile ?? {}

  const fpAny = fp as {
    bio?: string | null
    languages?: string[]
    linkedin_url?: string | null
    github_url?: string | null
    portfolio_url?: string | null
    hourly_rate?: number | null
    full_name?: string | null
    name?: string | null
  }

  const full_name = String(pr.full_name ?? fpAny.full_name ?? fpAny.name ?? "").trim()
  const email = String(pr.email ?? "").trim()
  const phone = String(pr.phone ?? "").trim()
  const location = String(pr.city ?? (fp as { location?: string }).location ?? "").trim()
  const avatar_url = String(pr.avatar_url ?? (fp as { profile_photo?: string }).profile_photo ?? "").trim()

  const hourlyRaw = (fp as { hourly_rate?: unknown }).hourly_rate
  let hourly_rate: number | null = null
  if (typeof hourlyRaw === "number" && !Number.isNaN(hourlyRaw)) hourly_rate = hourlyRaw
  else if (hourlyRaw != null && String(hourlyRaw).trim() !== "") {
    const n = Number(hourlyRaw)
    if (!Number.isNaN(n)) hourly_rate = n
  }

  const work_experience: CvWorkRow[] = (input.experienceRows ?? []).map((row) => ({
    role: String(row.title ?? "").trim(),
    company: String(row.organization ?? "").trim(),
    start_date: String(row.start_date ?? "").slice(0, 10),
    end_date: row.end_date ? String(row.end_date).slice(0, 10) : "",
    is_current: row.end_date == null,
    description: String(row.description ?? "").trim(),
  }))

  const education: CvEducationRow[] = (input.educationRows ?? []).map((row) => ({
    school: String(row.institution ?? "").trim(),
    degree: formatFreelancerEducationDegreeLevel(String(row.degree_level ?? "")),
    field_of_study: String(row.field_of_study ?? "").trim(),
    end_date: row.end_date ? String(row.end_date).slice(0, 10) : "",
  }))

  const extraSkills = Array.isArray((fp as { skills?: unknown }).skills)
    ? ((fp as { skills: unknown[] }).skills as unknown[]).map((s) => String(s).trim()).filter(Boolean)
    : []

  const profileCv: BuiltCv = {
    full_name,
    email,
    phone,
    location,
    linkedin_url: String(fpAny.linkedin_url ?? "").trim(),
    github_url: String(fpAny.github_url ?? "").trim(),
    portfolio_url: String(fpAny.portfolio_url ?? "").trim(),
    avatar_url,
    hourly_rate,
    professional_summary: sanitizeCvProfessionalSummary(String(fpAny.bio ?? "")),
    technical_skills: [...new Set([...input.skillNames.map((s) => s.trim()).filter(Boolean), ...extraSkills])],
    languages: [...new Set((fpAny.languages ?? []).map((s) => String(s).trim()).filter(Boolean))],
    work_experience,
    education,
    soft_skills: [],
  }

  return mergeSavedCv(profileCv, input.savedCv ?? null)
}
