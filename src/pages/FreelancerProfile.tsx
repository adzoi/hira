import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import { useToast } from "../components/ui/ToastProvider.tsx"
import { countFreelancerProfileVisits, recordProfileVisit } from "../lib/profileVisits.ts"
import { formatCityForDisplay } from "../lib/marketplaceFilters.ts"
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
}

type SkillData = { id: string; name: string }
type ServiceData = { id: string; title: string; description: string | null; price: number; delivery_days: number }
type ExperienceData = { id: string; title: string; organization: string; start_date: string; end_date: string | null; description: string | null }
type PortfolioData = { id: string; title: string; image_url: string; project_url: string | null }
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

function stripListingMeta(raw: string | null) {
  if (!raw) return raw
  const prefix = "<!--gigori-meta:"
  const suffix = "-->"
  if (!raw.startsWith(prefix)) return raw
  const endIndex = raw.indexOf(suffix)
  if (endIndex < 0) return raw
  return raw.slice(endIndex + suffix.length).trimStart()
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
  const [portfolioItems, setPortfolioItems] = useState<PortfolioData[]>([])
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)
  const [avatarLightboxOpen, setAvatarLightboxOpen] = useState(false)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [contactLoading, setContactLoading] = useState(false)
  /** Set only when logged-in viewer owns this freelancer profile (RLS-aligned). */
  const [ownerVisitCount, setOwnerVisitCount] = useState<number | null>(null)

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

        const profileSelectPublic = "id,full_name,avatar_url,city,member_since,cv_url"

        const [
          profileRes,
          freelancerSkillsRes,
          servicesRes,
          reviewsRes,
          experienceRes,
          portfolioRes,
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select(profileSelectPublic)
            .eq("id", freelancerData.user_id)
            .single(),
          supabase
            .from("freelancer_skills")
            .select("skills(id,name)")
            .eq("freelancer_profile_id", freelancerData.id),
          supabase
            .from("services")
            .select("id,title,description,price,delivery_days")
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
            .from("portfolio_items")
            .select("id,title,image_url,project_url")
            .eq("freelancer_profile_id", freelancerData.id)
            .order("sort_order", { ascending: true }),
        ])

        if (profileRes.error) throw profileRes.error
        if (freelancerSkillsRes.error) throw freelancerSkillsRes.error
        if (servicesRes.error) throw servicesRes.error
        if (reviewsRes.error) throw reviewsRes.error
        if (experienceRes.error) throw experienceRes.error
        if (portfolioRes.error) throw portfolioRes.error

        const base = profileRes.data as Omit<ProfileData, "phone" | "email"> &
          Partial<Pick<ProfileData, "phone" | "email">>
        setProfile({
          ...base,
          email: null,
          phone: null,
        })
        setServices(
          ((servicesRes.data ?? []) as ServiceData[]).map((service) => ({
            ...service,
            description: stripListingMeta(service.description ?? null),
          })),
        )
        setExperience((experienceRes.data ?? []) as ExperienceData[])
        setPortfolioItems((portfolioRes.data ?? []) as PortfolioData[])

        const mappedSkills =
          (freelancerSkillsRes.data ?? [])
            .map((item: any) => item.skills)
            .filter(Boolean)
            .map((skill: any) => ({ id: skill.id, name: skill.name })) ?? []
        setSkills(mappedSkills)

        const reviewRows = (reviewsRes.data ?? []) as Array<{
          id: string
          reviewer_id: string
          review_text: string
          rating_overall: number
          created_at: string
        }>
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

  const availabilityLabel = useMemo(() => {
    if (!freelancer?.availability) return "შეთანხმებით"
    if (freelancer.availability === "full_time") return "სრული განაკვეთი"
    if (freelancer.availability === "part_time") return "ნახევარი განაკვეთი"
    if (freelancer.availability === "weekends") return "შაბათ-კვირა"
    return freelancer.availability
  }, [freelancer?.availability])

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
    if (!profile?.cv_url) return
    await navigator.clipboard.writeText(profile.cv_url)
    pushToast({ type: "info", message: "CV-ის ბმული კოპირებულია" })
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] page-enter">
      <Navbar />
      <main className="mx-auto max-w-[900px] px-6 py-10">
        {loading ? (
          <div className="grid gap-4">
            <div className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            <div className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            <div className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          </div>
        ) : error || !freelancer || !profile ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error || "შეცდომა"}</div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setAvatarLightboxOpen(true)}
                  className="group relative shrink-0 rounded-full ring-[#1B2B4B] ring-offset-2 ring-offset-white transition hover:ring-2 focus:outline-none focus-visible:ring-2"
                  aria-label="ავატარის გადიდება"
                >
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={`${profile.full_name} ავატარი`}
                      loading="lazy"
                      className="h-[120px] w-[120px] rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-[120px] w-[120px] items-center justify-center rounded-full bg-[#1B2B4B] text-3xl font-bold text-white transition group-hover:bg-[#243a5c]">
                      {getInitials(profile.full_name)}
                    </div>
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <h1 className="text-3xl font-bold text-[#1B2B4B]">{profile.full_name}</h1>
                  <p className="mt-1 text-lg text-slate-600">{freelancer.professional_title ?? "ფრილანსერი"}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    📍 {formatCityForDisplay(profile.city) ?? "ქალაქი უცნობია"} • წევრი: {formatDate(profile.member_since)}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[#D4A843]">
                    {ratingStars(freelancer.average_rating)} {freelancer.average_rating.toFixed(1)} •{" "}
                    {freelancer.total_reviews_count} შეფასება
                  </p>
                  {ownerVisitCount !== null ? (
                    <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200/80">
                      საჯარო ნახვები:{" "}
                      <span className="font-bold tabular-nums text-[#1B2B4B]" title="ხელმისაწვდომია მხოლოდ ამ პროფილის მფლობელისთვის">
                        {ownerVisitCount}
                      </span>
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                      {availabilityLabel}
                    </span>
                    {freelancer.languages.map((language) => (
                      <span key={language} className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700">
                        {language}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    {freelancer.linkedin_url ? (
                      <a
                        href={freelancer.linkedin_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-[#1B2B4B] hover:border-[#D4A843]"
                      >
                        LinkedIn
                        <ExternalLinkArrowIcon className="h-3.5 w-3.5 opacity-80" />
                      </a>
                    ) : (
                      <span
                        className="inline-flex cursor-default items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-400"
                        title="ლინკი არ არის დამატებული"
                      >
                        LinkedIn
                      </span>
                    )}
                    {freelancer.github_url ? (
                      <a
                        href={freelancer.github_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-[#1B2B4B] hover:border-[#D4A843]"
                      >
                        GitHub
                        <ExternalLinkArrowIcon className="h-3.5 w-3.5 opacity-80" />
                      </a>
                    ) : (
                      <span
                        className="inline-flex cursor-default items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-400"
                        title="ლინკი არ არის დამატებული"
                      >
                        GitHub
                      </span>
                    )}
                    {freelancer.portfolio_url ? (
                      <a
                        href={freelancer.portfolio_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-[#1B2B4B] hover:border-[#D4A843]"
                      >
                        Portfolio
                        <ExternalLinkArrowIcon className="h-3.5 w-3.5 opacity-80" />
                      </a>
                    ) : (
                      <span
                        className="inline-flex cursor-default items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-400"
                        title="ლინკი არ არის დამატებული"
                      >
                        Portfolio
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void openContactModal()}
                  disabled={contactLoading}
                  className="h-11 shrink-0 rounded-lg bg-[#1B2B4B] px-5 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:pointer-events-none disabled:opacity-60"
                >
                  {contactLoading ? "იტვირთება…" : "კონტაქტი"}
                </button>
              </div>

              {profile.cv_url ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">რეზიუმე (CV)</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={profile.cv_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-[#1B2B4B] px-4 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B]"
                    >
                      CV-ის გახსნა
                    </a>
                    <button
                      type="button"
                      onClick={copyCvLink}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-[#1B2B4B] hover:border-[#D4A843]"
                    >
                      ბმულის კოპირება
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">სერვისები</h2>
              <div className="mt-4 space-y-3">
                {services.length === 0 ? (
                  <p className="text-sm text-slate-500">აქტიური სერვისები არ მოიძებნა.</p>
                ) : (
                  services.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => navigate(`/listings?open=${encodeURIComponent(service.id)}`)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#D4A843]/80 hover:bg-amber-50/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A843]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-[#1B2B4B]">{service.title}</p>
                        <p className="shrink-0 font-bold text-[#1B2B4B]">
                          {service.price === 0 ? "შეთანხმებით" : `${service.price} ₾`}
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{service.description ?? "აღწერა არ არის."}</p>
                      <p className="mt-2 text-xs text-slate-500">მიწოდება: {service.delivery_days} დღე</p>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">უნარები</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <span key={skill.id} className="rounded-full bg-[#D4A843] px-3 py-1 text-xs font-medium text-[#1B2B4B]">
                    {skill.name}
                  </span>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">შეფასებები</h2>
              <div className="mt-4 space-y-3">
                {reviews.length === 0 ? (
                  <p className="text-sm text-slate-500">შეფასებები ჯერ არ არის</p>
                ) : (
                  reviews.map((review) => (
                    <div key={review.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1B2B4B] text-xs font-bold text-white">
                          {getInitials(review.reviewer_name)}
                        </div>
                        <div>
                          <p className="font-semibold text-[#1B2B4B]">{review.reviewer_name}</p>
                          <p className="text-xs text-slate-500">{formatDate(review.created_at)}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-[#D4A843]">
                        {ratingStars(review.rating_overall)} {review.rating_overall.toFixed(1)}
                      </p>
                      <p className="mt-2 text-sm text-slate-700">{review.review_text}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            {portfolioItems.length > 0 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">პორტფოლიო</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {portfolioItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedImageUrl(item.image_url)}
                      className="overflow-hidden rounded-lg border border-slate-200 text-left"
                    >
                      <img src={item.image_url} alt={`${item.title} პორტფოლიო სურათი`} loading="lazy" className="h-36 w-full object-cover" />
                      <div className="p-2">
                        <p className="truncate text-sm font-semibold text-[#1B2B4B]">{item.title}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">ჩემ შესახებ</h2>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {freelancer.bio ?? "ინფორმაცია არ არის დამატებული."}
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">გამოცდილება</h2>
              <div className="mt-4 space-y-3">
                {experience.length === 0 ? (
                  <p className="text-sm text-slate-500">გამოცდილება არ არის დამატებული.</p>
                ) : (
                  experience.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                      <p className="font-semibold text-[#1B2B4B]">{item.title}</p>
                      <p className="text-sm text-slate-600">{item.organization}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(item.start_date)} - {item.end_date ? formatDate(item.end_date) : "დღემდე"}
                      </p>
                      {item.description ? <p className="mt-2 text-sm text-slate-700">{item.description}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            <Link to="/browse" className="inline-flex text-sm font-semibold text-[#D4A843] hover:underline">
              უკან ფრილანსერებზე
            </Link>
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
              <h2 id="contact-modal-title" className="text-lg font-bold text-[#1B2B4B]">
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
                  <p className="mt-1 break-all font-medium text-[#1B2B4B]">{profile.phone}</p>
                  <button
                    type="button"
                    onClick={() => void copyClip(profile.phone!, "ნომერი")}
                    className="mt-2 text-sm font-semibold text-[#D4A843] hover:underline"
                  >
                    კოპირება
                  </button>
                </div>
              ) : null}

              {profile.email && profile.email.trim() ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ელფოსტა</p>
                  <p className="mt-1 break-all font-medium text-[#1B2B4B]">{profile.email}</p>
                  <button
                    type="button"
                    onClick={() => void copyClip(profile.email!, "ელფოსტა")}
                    className="mt-2 text-sm font-semibold text-[#D4A843] hover:underline"
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
          <img src={selectedImageUrl} alt="პორტფოლიო სრული ზომა" className="max-h-full max-w-full rounded-lg" />
        </button>
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
                src={profile.avatar_url}
                alt={`${profile.full_name} ავატარი — დიდი`}
                className="max-h-[min(85vh,900px)] max-w-[min(85vw,900px)] rounded-full object-contain"
              />
            ) : (
              <div className="flex aspect-square max-h-[min(85vh,900px)] max-w-[min(85vw,900px)] min-h-[200px] min-w-[200px] items-center justify-center rounded-full bg-[#1B2B4B] p-16 text-7xl font-bold text-white sm:text-8xl">
                {getInitials(profile.full_name)}
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAvatarLightboxOpen(false)}
            className="absolute right-4 top-4 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#1B2B4B] shadow hover:bg-white"
          >
            დახურვა
          </button>
        </div>
      ) : null}
    </div>
  )
}
