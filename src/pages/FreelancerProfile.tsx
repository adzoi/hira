import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import { useToast } from "../components/ui/ToastProvider.tsx"
import { countFreelancerProfileVisits, recordProfileVisit } from "../lib/profileVisits.ts"
import { formatFreelancerEducationDegreeLevel } from "../lib/freelancerEducation.ts"
import { parseListingPreview } from "../lib/listingDescription.ts"
import { listingPriceNegotiable } from "../lib/homeFeed.ts"
import { formatCityForDisplay } from "../lib/marketplaceFilters.ts"
import { supabaseEdgeHeaders } from "../lib/supabaseEdgeHeaders.ts"
import FollowListsModal, { type FollowModalTab } from "../components/FollowListsModal.tsx"
import SaveBookmarkButton from "../components/SaveBookmarkButton.tsx"
import { countFollowers, countFollowing, followUser, isFollowing, unfollowUser } from "../lib/follows.ts"
import { avatarImageUrl, jobOrServiceImageDisplayUrl } from "../lib/storageImageUrl.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"

type ProfileData = {
  id: string
  full_name: string
  avatar_url: string | null
  city: string | null
  member_since: string
  email: string | null
  phone: string | null
  cv_url: string | null
}

type FreelancerData = {
  id: string
  slug: string
  professional_title: string | null
  average_rating: number
  total_reviews_count: number
  availability: string | null
  languages: string[]
  linkedin_url: string | null
  github_url: string | null
  portfolio_url: string | null
  bio: string | null
  user_id: string
  is_accepting_new_work?: boolean | null
  /** საჯარო პროფილის ჩვენების კონტროლი (RLS/RPC-თან თანხვედრაში). */
  show_completed_work_on_public_profile?: boolean
}

type SkillData = { id: string; name: string }
type ServiceData = {
  id: string
  title: string
  description: string | null
  price: number
  delivery_days: number
  views_count: number
  tags: string[]
  /** From raw listing text + price (before meta strip). */
  negotiable: boolean
}
type ExperienceData = { id: string; title: string; organization: string; start_date: string; end_date: string | null; description: string | null }
type EducationData = {
  id: string
  institution: string
  degree_level: string
  field_of_study: string | null
  end_date: string | null
}
type PortfolioData = { id: string; title: string; image_url: string; project_url: string | null }

type PublicCompletedPlatformJob = {
  completedJobId: string
  jobDescription: string
  hirerDisplayName: string
  hirerAvatarUrl: string | null
}

function embedCjJoin<T extends Record<string, unknown>>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] as T | undefined) ?? null : v
}

function mapPublicCompletedJobRows(rows: unknown[] | null | undefined): PublicCompletedPlatformJob[] {
  if (!rows?.length) return []
  const out: PublicCompletedPlatformJob[] = []
  for (const raw of rows as Array<Record<string, unknown>>) {
    const job = embedCjJoin(raw.jobs as Record<string, unknown> | Record<string, unknown>[] | null)
    const hp = embedCjJoin(raw.hirer_profiles as Record<string, unknown> | Record<string, unknown>[] | null)
    const completedAt = raw.completed_at != null ? String(raw.completed_at) : ""
    if (!completedAt) continue
    const completedJobId = typeof raw.id === "string" ? raw.id : ""
    if (!completedJobId) continue

    const descRaw = job?.description != null ? String(job.description) : ""
    const titleFallback = typeof job?.title === "string" && job.title.trim() ? job.title.trim() : ""
    const jobDescription = descRaw.trim() || titleFallback || "აღწერა არ არის."

    const profiles = hp ? embedCjJoin(hp.profiles as Record<string, unknown> | Record<string, unknown>[] | null) : null
    const company = typeof hp?.company_name === "string" ? hp.company_name.trim() : ""
    const profileName = typeof profiles?.full_name === "string" ? String(profiles.full_name).trim() : ""
    const hirerDisplayName = company || profileName || "დამქირავებელი"
    const hirerAvatarUrl =
      profiles?.avatar_url != null && String(profiles.avatar_url).trim()
        ? String(profiles.avatar_url).trim()
        : null

    out.push({
      completedJobId,
      jobDescription,
      hirerDisplayName,
      hirerAvatarUrl,
    })
  }
  return out
}

type ReviewData = {
  id: string
  reviewer_id: string
  review_text: string
  rating_overall: number
  created_at: string
  reviewer_name: string
}

function getInitials(fullName: string) {
  const parts = fullName.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "ფ"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("ka-GE")
}

function ratingStars(value: number) {
  const rounded = Math.round(value)
  return `${"★".repeat(Math.max(0, rounded))}${"☆".repeat(Math.max(0, 5 - rounded))}`
}

function ExternalLinkArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 17L17 7M17 7H10M17 7V14" />
    </svg>
  )
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

function CalendarOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function BriefcaseOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 11V7a3 3 0 0 1 6 0v4" />
      <rect x="2" y="9" width="20" height="12" rx="2" />
      <path d="M6 11h12" />
    </svg>
  )
}

function ClockOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function EyeOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function LinkedInBrandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

function GitHubBrandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

const tagChipClass =
  "inline-flex max-w-full items-center rounded-full border border-[#D1D5DB] bg-white px-2.5 py-0.5 text-xs font-medium text-[#374151] [overflow-wrap:anywhere]"

const primaryBtnClass =
  "inline-flex h-9 min-h-9 shrink-0 items-center justify-center rounded-lg bg-[#0088FF] px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#006ACC] disabled:pointer-events-none disabled:opacity-60"

const outlineBtnClass =
  "inline-flex h-9 min-h-9 shrink-0 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white px-4 text-sm font-medium text-[#374151] transition-colors duration-150 hover:bg-[#F9FAFB] disabled:pointer-events-none disabled:opacity-60"

const metaPillClass =
  "inline-flex w-fit max-w-full min-w-0 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[#D1D5DB] bg-white px-2.5 py-0.5 text-xs font-medium text-[#374151]"

export default function FreelancerProfilePage() {
  const { pushToast } = useToast()
  const navigate = useNavigate()
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [freelancer, setFreelancer] = useState<FreelancerData | null>(null)
  const [skills, setSkills] = useState<SkillData[]>([])
  const [services, setServices] = useState<ServiceData[]>([])
  const [reviews, setReviews] = useState<ReviewData[]>([])
  const [experience, setExperience] = useState<ExperienceData[]>([])
  const [education, setEducation] = useState<EducationData[]>([])
  const [portfolioItems, setPortfolioItems] = useState<PortfolioData[]>([])
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)
  const [avatarLightboxOpen, setAvatarLightboxOpen] = useState(false)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [contactLoading, setContactLoading] = useState(false)
  const [profileTab, setProfileTab] = useState<"services" | "bio" | "reviews">("services")
  /** Set only when logged-in viewer owns this freelancer profile (RLS-aligned). */
  const [ownerVisitCount, setOwnerVisitCount] = useState<number | null>(null)
  const [publicCompletedJobs, setPublicCompletedJobs] = useState<PublicCompletedPlatformJob[]>([])
  const [publicCompletedListings, setPublicCompletedListings] = useState<{ title: string; completedAt: string }[]>([])
  const [viewerIsOwner, setViewerIsOwner] = useState(false)
  const [publicCvSlug, setPublicCvSlug] = useState<string | null>(null)
  const [cvUploading, setCvUploading] = useState(false)
  const ownerCvInputRef = useRef<HTMLInputElement | null>(null)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [followListsModalOpen, setFollowListsModalOpen] = useState(false)
  const [followListsModalTab, setFollowListsModalTab] = useState<FollowModalTab>("followers")
  const [followButtonMode, setFollowButtonMode] = useState<"hidden" | "loading" | "guest" | "follow" | "unfollow">("hidden")
  const [followBusy, setFollowBusy] = useState(false)

  const profileAvatarDisplayUrl = useMemo(() => {
    if (!profile?.avatar_url) return null
    return avatarImageUrl(supabase, profile.avatar_url) ?? profile.avatar_url
  }, [profile?.avatar_url])

  useEffect(() => {
    document.title = "ფრილანსერები — გიგორი"
    return () => {
      document.title = "გიგორი"
    }
  }, [])

  useEffect(() => {
    const loadProfile = async () => {
      if (!slug) {
        setError("ფრილანსერი ვერ მოიძებნა.")
        setLoading(false)
        return
      }

      if (!isSupabaseConfigured || !supabase) {
        setError("Supabase არ არის კონფიგურირებული.")
        setLoading(false)
        return
      }

      try {
        setPublicCompletedJobs([])
        setPublicCompletedListings([])
        setViewerIsOwner(false)

        const { data: freelancerData, error: freelancerError } = await supabase
          .from("freelancer_profiles")
          .select("*")
          .eq("slug", slug)
          .eq("is_public", true)
          .single()

        if (freelancerError || !freelancerData) {
          throw new Error("ფრილანსერი ვერ მოიძებნა.")
        }

        setFreelancer(freelancerData as FreelancerData)

        const {
          data: { session },
        } = await supabase.auth.getSession()
        const isOwnerViewer = session?.user?.id === freelancerData.user_id
        setViewerIsOwner(isOwnerViewer)

        try {
          const cvRes = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cv-get?user_id=${encodeURIComponent(freelancerData.user_id)}`,
            {
              method: "GET",
              headers: supabaseEdgeHeaders(session?.access_token ?? null),
            },
          )
          if (cvRes.ok) {
            const cvPayload = await cvRes.json().catch(() => null)
            const cv = cvPayload?.cv
            const slugValue =
              cv &&
              typeof cv === "object" &&
              cv.is_visible_on_profile === true &&
              cv.is_public === true &&
              typeof cv.custom_slug === "string" &&
              cv.custom_slug.trim()
                ? cv.custom_slug.trim()
                : ""
            setPublicCvSlug(slugValue || null)
          } else {
            setPublicCvSlug(null)
          }
        } catch {
          setPublicCvSlug(null)
        }

        const profileSelectPublic = "id,full_name,avatar_url,city,member_since,cv_url"

        const [
          profileRes,
          freelancerProfileSkillsRes,
          servicesRes,
          reviewsRes,
          experienceRes,
          educationRes,
          portfolioRes,
          completedJobsRes,
          listingsRpcRes,
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select(profileSelectPublic)
            .eq("id", freelancerData.user_id)
            .single(),
          supabase
            .from("freelancer_profiles")
            .select(
              `
              freelancer_skills (
                skill_id,
                skills ( id, name )
              )
            `,
            )
            .eq("id", freelancerData.id)
            .eq("is_public", true)
            .maybeSingle(),
          supabase
            .from("services")
            .select("id,title,description,price,delivery_days,views_count")
            .eq("freelancer_profile_id", freelancerData.id)
            .eq("is_active", true)
            .order("created_at", { ascending: false }),
          supabase
            .from("reviews")
            .select("id,reviewer_id,review_text,rating_overall,created_at")
            .eq("reviewee_id", freelancerData.user_id)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("experience")
            .select("id,title,organization,start_date,end_date,description")
            .eq("freelancer_profile_id", freelancerData.id)
            .order("start_date", { ascending: false }),
          supabase
            .from("freelancer_education")
            .select("id,institution,degree_level,field_of_study,end_date")
            .eq("freelancer_profile_id", freelancerData.id)
            .order("end_date", { ascending: false }),
          supabase
            .from("portfolio_items")
            .select("id,title,image_url,project_url")
            .eq("freelancer_profile_id", freelancerData.id)
            .order("sort_order", { ascending: true }),
          supabase
            .from("completed_jobs")
            .select(
              `
              id,
              completed_at,
              job_id,
              jobs ( title, description ),
              hirer_profiles (
                company_name,
                profiles:profiles!hirer_profiles_user_id_fkey ( full_name, avatar_url )
              )
            `,
            )
            .eq("freelancer_profile_id", freelancerData.id)
            .not("completed_at", "is", null)
            .order("completed_at", { ascending: false })
            .limit(40),
          supabase.rpc("public_freelancer_completed_service_titles", {
            p_freelancer_profile_id: freelancerData.id,
          }),
        ])

        if (profileRes.error) throw profileRes.error
        if (freelancerProfileSkillsRes.error) throw freelancerProfileSkillsRes.error
        if (servicesRes.error) throw servicesRes.error
        if (reviewsRes.error) throw reviewsRes.error
        if (experienceRes.error) throw experienceRes.error
        if (educationRes.error) throw educationRes.error
        if (portfolioRes.error) throw portfolioRes.error

        if (completedJobsRes.error) {
          if (import.meta.env.DEV)
            console.warn("[FreelancerProfile] completed_jobs:", completedJobsRes.error.message)
          setPublicCompletedJobs([])
        } else {
          setPublicCompletedJobs(mapPublicCompletedJobRows(completedJobsRes.data as unknown[]))
        }
        if (listingsRpcRes.error) {
          if (import.meta.env.DEV)
            console.warn("[FreelancerProfile] completed listing titles RPC:", listingsRpcRes.error.message)
          setPublicCompletedListings([])
        } else {
          const rpcRows = (listingsRpcRes.data ?? []) as { service_title: string; completed_at: string }[]
          setPublicCompletedListings(
            rpcRows.map((row: { service_title: string; completed_at: string }) => ({
              title: row.service_title,
              completedAt: row.completed_at,
            })),
          )
        }

        const hideCompletedPublic =
          (freelancerData as FreelancerData).show_completed_work_on_public_profile === false
        if (hideCompletedPublic && !isOwnerViewer) {
          setPublicCompletedJobs([])
          setPublicCompletedListings([])
        }

        const base = profileRes.data as Omit<ProfileData, "phone" | "email"> &
          Partial<Pick<ProfileData, "phone" | "email">>
        setProfile({
          ...base,
          email: null,
          phone: null,
        })
        setServices(
          (
            (servicesRes.data ?? []) as Array<
              Omit<ServiceData, "tags" | "views_count" | "negotiable"> & { views_count?: number | null }
            >
          ).map((service) => {
            const rawDesc = String(service.description ?? "")
            const parsed = parseListingPreview(service.description ?? null)
            return {
              id: service.id,
              title: service.title,
              description: parsed.text.trim() ? parsed.text : null,
              price: service.price,
              delivery_days: service.delivery_days,
              views_count: Number(service.views_count ?? 0),
              tags: parsed.tags,
              negotiable: listingPriceNegotiable(service.price, rawDesc),
            }
          }),
        )
        setExperience((experienceRes.data ?? []) as ExperienceData[])
        setEducation((educationRes.data ?? []) as EducationData[])
        setPortfolioItems((portfolioRes.data ?? []) as PortfolioData[])

        type SkillCell = { id: string; name: string }
        type FsRowRaw = { skill_id?: string | null; skills?: SkillCell | SkillCell[] | null }

        function firstSkill(skillCell: FsRowRaw["skills"]): SkillCell | null {
          if (!skillCell) return null
          return Array.isArray(skillCell) ? skillCell[0] ?? null : skillCell
        }

        const fpSkillPayload =
          freelancerProfileSkillsRes.data as { freelancer_skills?: FsRowRaw[] | null } | null
        const fsRowsRaw = fpSkillPayload?.freelancer_skills ?? []

        const skillById = new Map<string, { id: string; name: string }>()
        const idsNeedingName: string[] = []
        for (const row of fsRowsRaw) {
          const embedded = firstSkill(row.skills)
          if (embedded?.id && embedded?.name) {
            skillById.set(embedded.id, { id: embedded.id, name: embedded.name })
            continue
          }
          const sid = row.skill_id ?? embedded?.id
          if (sid && !skillById.has(sid)) idsNeedingName.push(sid)
        }
        const uniqueMissing = [...new Set(idsNeedingName)]
        async function hydrateSkills(ids: string[]) {
          const uniq = [...new Set(ids.filter(Boolean))]
          if (uniq.length === 0 || !supabase) return
          const { data: skillRowsExtra, error: skillRowsExtraErr } = await supabase
            .from("skills")
            .select("id,name")
            .in("id", uniq)
            .eq("is_approved", true)
          if (skillRowsExtraErr) throw skillRowsExtraErr
          for (const s of skillRowsExtra ?? []) {
            if (s.id && s.name) skillById.set(s.id, { id: s.id, name: s.name })
          }
        }

        if (uniqueMissing.length > 0) await hydrateSkills(uniqueMissing)

        if (skillById.size === 0) {
          const { data: rawFs, error: rawFsErr } = await supabase
            .from("freelancer_skills")
            .select("skill_id")
            .eq("freelancer_profile_id", freelancerData.id)
          if (!rawFsErr && rawFs?.length) {
            await hydrateSkills(rawFs.map((r) => String(r.skill_id ?? "")))
          }
        }

        setSkills([...skillById.values()])

        const reviewRows = (reviewsRes.data ?? []) as Array<{
          id: string
          reviewer_id: string
          review_text: string
          rating_overall: number
          created_at: string
        }>
        const reviewRatings = reviewRows
          .map((r) => Number(r.rating_overall))
          .filter((n) => Number.isFinite(n))
        if (reviewRatings.length > 0) {
          const avg = reviewRatings.reduce((sum, n) => sum + n, 0) / reviewRatings.length
          setFreelancer((prev) =>
            prev
              ? {
                  ...prev,
                  average_rating: avg,
                  total_reviews_count: Math.max(prev.total_reviews_count ?? 0, reviewRows.length),
                }
              : prev,
          )
        }
        const reviewerIds = Array.from(new Set(reviewRows.map((review) => review.reviewer_id)))

        let reviewerMap: Record<string, string> = {}
        if (reviewerIds.length > 0) {
          const { data: reviewersData, error: reviewersError } = await supabase
            .from("profiles")
            .select("id,full_name")
            .in("id", reviewerIds)
          if (reviewersError) throw reviewersError
          reviewerMap =
            reviewersData?.reduce<Record<string, string>>((acc, row) => {
              acc[row.id] = row.full_name
              return acc
            }, {}) ?? {}
        }

        setReviews(
          reviewRows.map((review) => ({
            ...review,
            reviewer_name: reviewerMap[review.reviewer_id] ?? "მომხმარებელი",
          })),
        )

        void recordProfileVisit({
          kind: "freelancer",
          freelancerProfileId: freelancerData.id,
          profileOwnerUserId: freelancerData.user_id,
        })
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "მონაცემები ვერ ჩაიტვირთა.")
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [slug])

  useEffect(() => {
    if (!freelancer || !isSupabaseConfigured || !supabase) {
      setOwnerVisitCount(null)
      return
    }

    const client = supabase
    let cancelled = false

    const loadVisitCountIfOwner = async () => {
      const {
        data: { session },
      } = await client.auth.getSession()
      if (!session?.user?.id || session.user.id !== freelancer.user_id) {
        if (!cancelled) setOwnerVisitCount(null)
        return
      }
      const n = await countFreelancerProfileVisits(freelancer.id)
      if (!cancelled) setOwnerVisitCount(n)
    }

    void loadVisitCountIfOwner()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      void loadVisitCountIfOwner()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [freelancer?.id, freelancer?.user_id])

  const showContactFlag = searchParams.get("showContact") === "1"

  useEffect(() => {
    if (!showContactFlag || !freelancer || !isSupabaseConfigured || !supabase) return

    let cancelled = false

    ;(async () => {
      const { data: sessionPayload } = await supabase.auth.getSession()
      if (cancelled) return

      const next = new URLSearchParams(searchParams)
      next.delete("showContact")
      setSearchParams(next, { replace: true })

      if (!sessionPayload.session) return

      const { data: row, error: fetchError } = await supabase
        .from("profiles")
        .select("phone,email")
        .eq("id", freelancer.user_id)
        .single()

      if (cancelled || fetchError || !row) return

      const phoneVal = row.phone !== undefined && row.phone !== null ? String(row.phone).trim() : ""
      const emailVal = row.email !== undefined && row.email !== null ? String(row.email).trim() : ""

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              phone: (phoneVal || prev.phone) ?? null,
              email: (emailVal || prev.email) ?? null,
            }
          : prev,
      )

      if (phoneVal || emailVal) {
        setContactModalOpen(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [showContactFlag, freelancer?.id, searchParams, setSearchParams])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !profile?.id) {
      setFollowerCount(0)
      setFollowingCount(0)
      setFollowButtonMode("hidden")
      return
    }

    let cancelled = false

    ;(async () => {
      if (viewerIsOwner) setFollowButtonMode("hidden")

      try {
        const [n, nf] = await Promise.all([countFollowers(profile.id), countFollowing(profile.id)])
        if (cancelled) return
        setFollowerCount(Number.isFinite(n) ? n : 0)
        setFollowingCount(Number.isFinite(nf) ? nf : 0)
      } catch {
        if (!cancelled) {
          setFollowerCount(0)
          setFollowingCount(0)
        }
      }

      if (viewerIsOwner || cancelled) return

      setFollowButtonMode("loading")
      try {
        const { data: sessionPayload } = await supabase.auth.getSession()
        if (!sessionPayload.session?.user?.id) {
          if (!cancelled) setFollowButtonMode("guest")
          return
        }
        const follows = await isFollowing(profile.id)
        if (cancelled) return
        setFollowButtonMode(follows ? "unfollow" : "follow")
      } catch {
        if (!cancelled) setFollowButtonMode("guest")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [profile?.id, viewerIsOwner])

  const handleFollowToggle = async () => {
    if (!supabase || !profile?.id || viewerIsOwner || followBusy) return

    const path = `/freelancer/${encodeURIComponent(slug ?? "")}`
    if (followButtonMode === "guest") {
      navigate(`/login?reason=follow&redirect=${encodeURIComponent(path)}`)
      return
    }

    if (followButtonMode !== "follow" && followButtonMode !== "unfollow") return

    setFollowBusy(true)
    try {
      if (followButtonMode === "follow") {
        await followUser(profile.id)
        setFollowButtonMode("unfollow")
        setFollowerCount((c) => Math.max(0, (Number.isFinite(c) ? c : 0) + 1))
        pushToast({ type: "success", message: "გამოწერა დასრულდა." })
      } else {
        await unfollowUser(profile.id)
        setFollowButtonMode("follow")
        setFollowerCount((c) => Math.max(0, (Number.isFinite(c) ? c : 0) - 1))
        pushToast({ type: "info", message: "გამოწერა გაუქმდა." })
      }
    } catch (e) {
      pushToast({
        type: "error",
        message: e instanceof Error ? e.message : "დაფიქსირდა შეცდომა.",
      })
    } finally {
      setFollowBusy(false)
    }
  }

  const openContactModal = async () => {
    if (!isSupabaseConfigured || !supabase || !freelancer || !slug) return

    const { data: sessionPayload } = await supabase.auth.getSession()
    if (!sessionPayload.session) {
      const path = `/freelancer/${encodeURIComponent(slug)}`
      navigate(`/login?reason=contact&redirect=${encodeURIComponent(path)}`)
      return
    }

    setContactLoading(true)
    try {
      const { data: row, error: fetchError } = await supabase
        .from("profiles")
        .select("phone,email")
        .eq("id", freelancer.user_id)
        .single()

      if (fetchError || !row) {
        pushToast({
          type: "error",
          message: "საკონტაქტო მონაცემები ვერ ჩაიტვირთა",
        })
        return
      }

      const phoneVal = row.phone !== undefined && row.phone !== null ? String(row.phone).trim() : ""
      const emailVal = row.email !== undefined && row.email !== null ? String(row.email).trim() : ""

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              phone: (phoneVal || prev.phone) ?? null,
              email: (emailVal || prev.email) ?? null,
            }
          : prev,
      )

      if (!phoneVal && !emailVal) {
        pushToast({ type: "info", message: "ეს ფრილანსერი კონტაქტს ჯერ არ აუზუსტებია." })
        return
      }

      setContactModalOpen(true)
    } finally {
      setContactLoading(false)
    }
  }

  const copyClip = async (value: string, label: string) => {
    if (!value.trim()) return
    await navigator.clipboard.writeText(value)
    pushToast({ type: "info", message: `${label} კოპირებულია` })
  }

  const copyCvLink = async () => {
    if (profile?.cv_url) {
      await navigator.clipboard.writeText(profile.cv_url)
      pushToast({ type: "info", message: "CV-ის ბმული კოპირებულია" })
      return
    }
    if (publicCvSlug) {
      const url = `${window.location.origin}/cv/${encodeURIComponent(publicCvSlug)}`
      await navigator.clipboard.writeText(url)
      pushToast({ type: "info", message: "CV-ის ბმული კოპირებულია" })
    }
  }

  const handleOwnerCvUpload = async (file: File) => {
    if (!viewerIsOwner || !supabase || !profile) return
    if (file.size > 10 * 1024 * 1024) {
      pushToast({ type: "error", message: "CV-ს ზომა არ უნდა აღემატებოდეს 10MB-ს." })
      return
    }
    if (file.type !== "application/pdf") {
      pushToast({ type: "error", message: "მხოლოდ PDF ფორმატი დაიშვება." })
      return
    }
    setCvUploading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || user.id !== profile.id) {
        pushToast({ type: "error", message: "მხოლოდ პროფილის მფლობელს შეუძლია CV ატვირთოს." })
        return
      }

      const filePath = `${user.id}/cv.pdf`
      const { error: uploadError } = await supabase.storage.from("cvs").upload(filePath, file, { upsert: true })
      if (uploadError) throw uploadError

      const {
        data: { publicUrl },
      } = supabase.storage.from("cvs").getPublicUrl(filePath)

      const { error: updateError } = await supabase.from("profiles").update({ cv_url: publicUrl }).eq("id", user.id)
      if (updateError) throw updateError

      setProfile((prev) => (prev ? { ...prev, cv_url: publicUrl } : prev))
      pushToast({ type: "success", message: "CV დამატებულია პროფილზე." })
    } catch (e) {
      pushToast({ type: "error", message: e instanceof Error ? e.message : "CV ატვირთვა ვერ მოხერხდა." })
    } finally {
      setCvUploading(false)
    }
  }

  const completedWorkHiddenPublic = freelancer ? freelancer.show_completed_work_on_public_profile === false : false
  const completedWorkHasRows = publicCompletedJobs.length > 0 || publicCompletedListings.length > 0
  const completedWorkCount = publicCompletedJobs.length + publicCompletedListings.length
  void completedWorkHiddenPublic
  void completedWorkHasRows

  return (
    <div className="min-h-screen bg-[#F9FAFB] page-enter">
      <Navbar />
      <main className="mx-auto max-w-[900px] px-6 py-10">
        {loading ? (
          <div className="grid gap-5">
            <div className="h-48 animate-pulse rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]" />
            <div className="h-11 animate-pulse rounded-full border border-[#E5E7EB] bg-white" />
            <div className="h-40 animate-pulse rounded-[14px] border border-[#E5E7EB] bg-white" />
          </div>
        ) : error || !freelancer || !profile ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error || "შეცდომა"}</div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-[14px] border border-[#E5E7EB] bg-white px-6 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <div className="flex items-start gap-4">
                <div className="flex shrink-0 flex-col items-center">
                  <button
                    type="button"
                    onClick={() => setAvatarLightboxOpen(true)}
                    className="group relative box-border h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full border-2 border-[#E5E7EB] bg-white p-0 transition hover:border-[#0088FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0088FF] focus-visible:ring-offset-2"
                    aria-label="ავატარის გადიდება"
                  >
                    {profile.avatar_url ? (
                      <img
                        src={profileAvatarDisplayUrl ?? profile.avatar_url}
                        alt={`${profile.full_name} ავატარი`}
                        loading="lazy"
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-[#0088FF] text-2xl font-bold text-white transition group-hover:bg-[#006ACC]">
                        {getInitials(profile.full_name)}
                      </div>
                    )}
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <h1 className="text-xl font-semibold text-gray-900">{profile.full_name}</h1>
                      <p className="mt-0.5 text-sm text-gray-500">{freelancer.professional_title ?? "ფრილანსერი"}</p>
                    </div>
                    <div className="ml-auto flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
                      {!viewerIsOwner ? (
                        <SaveBookmarkButton variant="icon" resourceType="freelancer" resourceId={freelancer.id} />
                      ) : null}
                      {followButtonMode !== "hidden" ? (
                        <button
                          type="button"
                          onClick={() => void handleFollowToggle()}
                          disabled={followBusy || followButtonMode === "loading"}
                          className={
                            followButtonMode === "unfollow"
                              ? `${outlineBtnClass} min-w-[8rem]`
                              : `${primaryBtnClass} min-w-[8rem]`
                          }
                        >
                          {followBusy
                            ? "მიმდინარეობს..."
                            : followButtonMode === "loading"
                              ? "იტვირთება…"
                              : followButtonMode === "unfollow"
                                ? "გამოწერილი"
                                : "გამოწერა"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void openContactModal()}
                        disabled={contactLoading}
                        className={`${primaryBtnClass} min-w-[8rem]`}
                      >
                        {contactLoading ? "იტვირთება…" : "კონტაქტი"}
                      </button>
                    </div>
                  </div>

                  {freelancer.is_accepting_new_work === false ? (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      ეს ფრილანსერი ამჟამად ახალი სამუშაოებისთვის ხელმიუწვდომელია — შეთავაზება ლისტინგებიდან მაინც შეგიძლიათ.
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPinIcon className="h-4 w-4 shrink-0 text-red-500" />
                      {formatCityForDisplay(profile.city) ?? "ქალაქი უცნობია"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarOutlineIcon className="h-4 w-4 shrink-0 text-gray-400" />
                      {formatDate(profile.member_since)}
                    </span>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <span className="text-amber-400">{ratingStars(freelancer.average_rating)}</span>
                      <span className="font-semibold text-gray-900">{freelancer.average_rating.toFixed(1)}</span>
                      <span>
                        • {freelancer.total_reviews_count} შეფასება
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <BriefcaseOutlineIcon className="h-4 w-4 shrink-0 text-gray-400" />
                      {completedWorkCount} შესრულებული სამუშაო
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => {
                        setFollowListsModalTab("followers")
                        setFollowListsModalOpen(true)
                      }}
                      className="w-full rounded-[10px] bg-[#F9FAFB] px-4 py-3 text-center transition hover:bg-gray-100"
                    >
                      <p className="mb-1 text-xs text-gray-500">გამომწერი</p>
                      <p className="text-lg font-semibold tabular-nums text-gray-900">{followerCount}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFollowListsModalTab("following")
                        setFollowListsModalOpen(true)
                      }}
                      className="w-full rounded-[10px] bg-[#F9FAFB] px-4 py-3 text-center transition hover:bg-gray-100"
                    >
                      <p className="mb-1 text-xs text-gray-500">გამოწერილი</p>
                      <p className="text-lg font-semibold tabular-nums text-gray-900">{followingCount}</p>
                    </button>
                    <div className="rounded-[10px] bg-[#F9FAFB] px-4 py-3 text-center">
                      <p className="mb-1 text-xs text-gray-500">შეფასება</p>
                      <p className="text-lg font-semibold tabular-nums text-gray-900">{freelancer.total_reviews_count}</p>
                    </div>
                    <div className="rounded-[10px] bg-[#F9FAFB] px-4 py-3 text-center">
                      <p className="mb-1 text-xs text-gray-500">დასრულებული</p>
                      <p className="text-lg font-semibold tabular-nums text-gray-900">{completedWorkCount}</p>
                    </div>
                  </div>

                  {ownerVisitCount !== null ? (
                    <p className="mt-3 text-xs text-gray-500">
                      საჯარო ნახვები:{" "}
                      <span className="font-semibold tabular-nums text-gray-900" title="ხელმისაწვდომია მხოლოდ ამ პროფილის მფლობელისთვის">
                        {ownerVisitCount}
                      </span>
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                    <span className="text-sm text-gray-500">ენები:</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {freelancer.languages.map((language) => (
                        <span key={language} className={tagChipClass}>
                          {language}
                        </span>
                      ))}
                    </div>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      {freelancer.linkedin_url ? (
                        <a
                          href={freelancer.linkedin_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] px-3 py-1 text-sm text-[#0088FF] transition hover:bg-[#F9FAFB]"
                        >
                          <LinkedInBrandIcon className="h-4 w-4" />
                          LinkedIn
                        </a>
                      ) : (
                        <span
                          className="inline-flex cursor-default items-center gap-1 rounded-full border border-[#E5E7EB] px-3 py-1 text-sm text-gray-400"
                          title="ლინკი არ არის დამატებული"
                        >
                          <LinkedInBrandIcon className="h-4 w-4 opacity-50" />
                          LinkedIn
                        </span>
                      )}
                      {freelancer.github_url ? (
                        <a
                          href={freelancer.github_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] px-3 py-1 text-sm text-[#0088FF] transition hover:bg-[#F9FAFB]"
                        >
                          <GitHubBrandIcon className="h-4 w-4" />
                          GitHub
                        </a>
                      ) : (
                        <span
                          className="inline-flex cursor-default items-center gap-1 rounded-full border border-[#E5E7EB] px-3 py-1 text-sm text-gray-400"
                          title="ლინკი არ არის დამატებული"
                        >
                          <GitHubBrandIcon className="h-4 w-4 opacity-50" />
                          GitHub
                        </span>
                      )}
                      {freelancer.portfolio_url ? (
                        <a
                          href={freelancer.portfolio_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1 text-sm text-red-500 transition hover:bg-red-50"
                        >
                          <ExternalLinkArrowIcon className="h-3.5 w-3.5" />
                          Portfolio
                        </a>
                      ) : (
                        <span
                          className="inline-flex cursor-default items-center gap-1 rounded-full border border-[#E5E7EB] px-3 py-1 text-sm text-gray-400"
                          title="ლინკი არ არის დამატებული"
                        >
                          <ExternalLinkArrowIcon className="h-3.5 w-3.5" />
                          Portfolio
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
                    <span className="text-sm text-gray-500">რეზიუმე (CV):</span>
                    {viewerIsOwner ? (
                      <>
                        <input
                          ref={ownerCvInputRef}
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) void handleOwnerCvUpload(file)
                            e.currentTarget.value = ""
                          }}
                        />
                        <button
                          type="button"
                          disabled={cvUploading}
                          onClick={() => ownerCvInputRef.current?.click()}
                          className={outlineBtnClass}
                        >
                          {cvUploading ? "იტვირთება..." : "CV დამატება"}
                        </button>
                        <Link to="/cv-generator" className={outlineBtnClass}>
                          CV გენერაცია
                        </Link>
                      </>
                    ) : null}
                    {profile.cv_url ? (
                      <a
                        href={profile.cv_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={primaryBtnClass}
                      >
                        CV-ის გახსნა
                      </a>
                    ) : publicCvSlug ? (
                      <Link to={`/cv/${encodeURIComponent(publicCvSlug)}`} className={primaryBtnClass}>
                        CV-ის გახსნა
                      </Link>
                    ) : null}
                    {profile.cv_url || publicCvSlug ? (
                      <button type="button" onClick={() => void copyCvLink()} className={outlineBtnClass}>
                        ბმულის კოპირება
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setProfileTab("services")}
                className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors duration-150 ${
                  profileTab === "services"
                    ? "border border-[#0088FF] bg-[#0088FF] text-white"
                    : "border border-[#E5E7EB] bg-white text-[#6B7280]"
                }`}
              >
                სერვისები
              </button>
              <button
                type="button"
                onClick={() => setProfileTab("bio")}
                className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors duration-150 ${
                  profileTab === "bio"
                    ? "border border-[#0088FF] bg-[#0088FF] text-white"
                    : "border border-[#E5E7EB] bg-white text-[#6B7280]"
                }`}
              >
                ჩემს შესახებ
              </button>
              <button
                type="button"
                onClick={() => setProfileTab("reviews")}
                className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors duration-150 ${
                  profileTab === "reviews"
                    ? "border border-[#0088FF] bg-[#0088FF] text-white"
                    : "border border-[#E5E7EB] bg-white text-[#6B7280]"
                }`}
              >
                შეფასებები
              </button>
            </div>

            {profileTab === "services" ? (
              <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[14px]">
                {services.length === 0 ? (
                  <p className="col-span-full text-sm text-gray-500">აქტიური სერვისები არ მოიძებნა.</p>
                ) : (
                  services.map((service) => {
                    const negotiable = service.negotiable
                    return (
                      <article
                        key={service.id}
                        className="flex min-h-[280px] flex-col rounded-[14px] border border-[#E5E7EB] border-l-[3px] border-l-transparent bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-[border-left-color,box-shadow] duration-200 ease-out hover:border-l-[#0088FF] hover:shadow-[-4px_0_12px_rgba(0,136,255,0.2)]"
                      >
                        <p className="mb-1 text-xs text-gray-400">ფრილანსერი · სერვისი</p>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <span className="text-amber-400">{ratingStars(freelancer.average_rating)}</span>
                          <span className="text-gray-900">{freelancer.average_rating.toFixed(1)}</span>
                        </div>
                        <h2 className="mt-2 mb-2 line-clamp-2 text-base font-semibold text-gray-900">{service.title}</h2>
                        <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-gray-500">
                          {service.description?.trim() ? service.description : "აღწერა არ არის."}
                        </p>
                        {service.tags.length > 0 ? (
                          <div className="mb-3 flex flex-wrap gap-1.5">
                            {service.tags.slice(0, 5).map((tag) => (
                              <span key={`${service.id}-${tag}`} className={tagChipClass}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mb-4 flex flex-wrap gap-1.5">
                          <span className={metaPillClass}>
                            {negotiable ? "შეთანხმებით" : `${service.price.toLocaleString("ka-GE")} ₾`}
                          </span>
                          {!negotiable ? (
                            <span className={metaPillClass}>
                              <ClockOutlineIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                              {service.delivery_days} სამუშაო დღე
                            </span>
                          ) : null}
                          <span className={metaPillClass}>
                            <EyeOutlineIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                            {service.views_count} ნახვა
                          </span>
                        </div>
                        <div className="mt-auto flex gap-2 pt-1">
                          <Link
                            to={`/listing/${encodeURIComponent(service.id)}`}
                            className={`${primaryBtnClass} min-h-9 flex-1 text-center`}
                          >
                            დეტალების ნახვა
                          </Link>
                          <Link
                            to={`/freelancer/${encodeURIComponent(freelancer.slug)}`}
                            className={`${outlineBtnClass} min-h-9 flex-1 text-center`}
                            onClick={() => window.scrollTo(0, 0)}
                          >
                            პროფილი
                          </Link>
                        </div>
                      </article>
                    )
                  })
                )}
              </div>
            ) : null}

            {profileTab === "bio" ? (
              <div className="mt-5 space-y-5">
                <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <h2 className="text-lg font-semibold text-gray-900">ბიო</h2>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[#374151]">
                    {freelancer.bio ?? "ინფორმაცია არ არის დამატებული."}
                  </p>
                </section>

                <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <h2 className="text-lg font-semibold text-gray-900">გამოცდილება</h2>
                  <div className="mt-4 space-y-3">
                    {experience.length === 0 ? (
                      <p className="text-sm text-gray-500">გამოცდილება არ არის დამატებული.</p>
                    ) : (
                      experience.map((item) => (
                        <div key={item.id} className="rounded-[10px] border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                          <p className="font-semibold text-gray-900">{item.title}</p>
                          <p className="text-sm text-gray-600">{item.organization}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {formatDate(item.start_date)} - {item.end_date ? formatDate(item.end_date) : "დღემდე"}
                          </p>
                          {item.description ? <p className="mt-2 text-sm text-[#374151]">{item.description}</p> : null}
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <h2 className="text-lg font-semibold text-gray-900">განათლება</h2>
                  <div className="mt-4 space-y-3">
                    {education.length === 0 ? (
                      <p className="text-sm text-gray-500">განათლება არ არის დამატებული.</p>
                    ) : (
                      education.map((item) => (
                        <div key={item.id} className="rounded-[10px] border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                          <p className="font-semibold text-gray-900">
                            {formatFreelancerEducationDegreeLevel(item.degree_level)}
                            {item.field_of_study?.trim() ? ` — ${item.field_of_study.trim()}` : ""}
                          </p>
                          <p className="text-sm text-gray-600">{item.institution}</p>
                          {item.end_date ? (
                            <p className="mt-1 text-xs text-gray-500">დასრულება: {formatDate(item.end_date)}</p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <h2 className="text-lg font-semibold text-gray-900">უნარები</h2>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {skills.map((skill) => (
                      <span key={skill.id} className={tagChipClass}>
                        {skill.name}
                      </span>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            {profileTab === "reviews" ? (
              <section className="mt-5 rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <div className="space-y-3">
                  {reviews.length === 0 ? (
                    <p className="text-sm text-gray-500">შეფასებები ჯერ არ არის</p>
                  ) : (
                    reviews.map((review) => (
                      <div key={review.id} className="rounded-[10px] border border-[#E5E7EB] p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0088FF] text-xs font-bold text-white">
                            {getInitials(review.reviewer_name)}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{review.reviewer_name}</p>
                            <p className="text-xs text-gray-500">{formatDate(review.created_at)}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-sm font-semibold">
                          <span className="text-amber-400">{ratingStars(review.rating_overall)}</span>{" "}
                          <span className="text-gray-900">{review.rating_overall.toFixed(1)}</span>
                        </p>
                        <p className="mt-2 text-sm text-[#374151]">{review.review_text}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : null}

            {portfolioItems.length > 0 ? (
              <section className="mt-5 rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <h2 className="text-lg font-semibold text-gray-900">პორტფოლიო</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {portfolioItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedImageUrl(item.image_url)}
                      className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:border-[#0088FF]/40"
                    >
                      <img
                        src={jobOrServiceImageDisplayUrl(supabase, item.image_url, "thumbnail") ?? item.image_url}
                        alt={`${item.title} პორტფოლიო სურათი`}
                        loading="lazy"
                        className="h-36 w-full object-cover"
                      />
                      <div className="p-3">
                        <p className="truncate text-sm font-semibold text-gray-900">{item.title}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </main>

      {contactModalOpen && profile ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setContactModalOpen(false)
          }}
        >
          <div
            className="relative max-h-[min(85vh,calc(100vh-32px))] w-full max-w-md overflow-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 id="contact-modal-title" className="text-lg font-bold text-gray-900">
                საკონტაქტო
              </h2>
              <button
                type="button"
                onClick={() => setContactModalOpen(false)}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">{profile.full_name}</p>

            <div className="mt-5 space-y-4">
              {profile.phone && profile.phone.trim() ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ტელეფონი</p>
                  <p className="mt-1 break-all font-medium text-gray-900">{profile.phone}</p>
                  <button
                    type="button"
                    onClick={() => void copyClip(profile.phone!, "ნომერი")}
                    className="mt-2 text-sm font-semibold text-[#0088FF] hover:underline"
                  >
                    კოპირება
                  </button>
                </div>
              ) : null}

              {profile.email && profile.email.trim() ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ელფოსტა</p>
                  <p className="mt-1 break-all font-medium text-gray-900">{profile.email}</p>
                  <button
                    type="button"
                    onClick={() => void copyClip(profile.email!, "ელფოსტა")}
                    className="mt-2 text-sm font-semibold text-[#0088FF] hover:underline"
                  >
                    კოპირება
                  </button>
                </div>
              ) : null}

              {!profile.phone?.trim() && !profile.email?.trim() ? (
                <p className="text-sm text-slate-600">ეს ფრილანსერი საკონტაქტო მონაცემებს ჯერ არ აუზუსტებია.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {selectedImageUrl ? (
        <button
          type="button"
          onClick={() => setSelectedImageUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
        >
          <img
            src={jobOrServiceImageDisplayUrl(supabase, selectedImageUrl, "detail") ?? selectedImageUrl}
            alt="პორტფოლიო სრული ზომა"
            className="max-h-full max-w-full rounded-lg"
          />
        </button>
      ) : null}

      {profile ? (
        <FollowListsModal
          open={followListsModalOpen}
          onClose={() => setFollowListsModalOpen(false)}
          profileId={profile.id}
          initialTab={followListsModalTab}
        />
      ) : null}
      {avatarLightboxOpen && profile ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ავატარი"
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setAvatarLightboxOpen(false)}
        >
          <button
            type="button"
            className="relative max-h-[min(85vh,900px)] max-w-[min(85vw,900px)] rounded-full border-4 border-white shadow-2xl ring-4 ring-black/20"
            onClick={(e) => e.stopPropagation()}
          >
            {profile.avatar_url ? (
              <img
                src={profileAvatarDisplayUrl ?? profile.avatar_url}
                alt={`${profile.full_name} ავატარი — დიდი`}
                className="max-h-[min(85vh,900px)] max-w-[min(85vw,900px)] rounded-full object-contain"
              />
            ) : (
              <div className="flex aspect-square max-h-[min(85vh,900px)] max-w-[min(85vw,900px)] min-h-[200px] min-w-[200px] items-center justify-center rounded-full bg-[#0088FF] p-16 text-7xl font-bold text-white sm:text-8xl">
                {getInitials(profile.full_name)}
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAvatarLightboxOpen(false)}
            className="absolute right-4 top-4 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-gray-900 shadow hover:bg-white"
          >
            დახურვა
          </button>
        </div>
      ) : null}
    </div>
  )
}
