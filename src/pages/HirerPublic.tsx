import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import { countHirerProfileVisits, recordProfileVisit } from "../lib/profileVisits.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type HirerLoaded = {
  id: string
  ownerUserId: string
  companyName: string
  industry: string | null
  description: string | null
  websiteUrl: string | null
  jobsPosted: number
  completedJobs: number
  contactName: string
  avatarUrl: string | null
  city: string | null
}

type OpenJobBrief = {
  id: string
  title: string
  budgetMin: number | null
  budgetMax: number | null
  budgetType: string
}

type HirerReviewDisplay = {
  id: string
  reviewer_id: string
  review_text: string
  rating_overall: number
  created_at: string
  reviewer_name: string
}

/** Joined `profiles` row from Supabase; client types may infer this as an array. */
type HirerJoinedProfile = {
  full_name: string | null
  avatar_url: string | null
  city: string | null
}

function joinedProfileOne(
  raw: HirerJoinedProfile | HirerJoinedProfile[] | null | undefined,
): HirerJoinedProfile | null {
  if (raw == null) return null
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

function companyInitials(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return "კო"
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
  }
  const only = parts[0] ?? "კ"
  return only.slice(0, 2).toUpperCase()
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("ka-GE")
}

function ratingStars(value: number) {
  const rounded = Math.round(value)
  return `${"★".repeat(Math.max(0, rounded))}${"☆".repeat(Math.max(0, 5 - rounded))}`
}

function reviewerInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "ფ"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function formatBudget(job: OpenJobBrief) {
  const min = job.budgetMin
  const max = job.budgetMax
  const bType = job.budgetType
  const label =
    bType === "hourly"
      ? "საათში"
      : bType === "monthly"
        ? "თვეში"
        : "ბიუჯეტი"
  if (min !== null && max !== null && min === max) {
    return `${min.toLocaleString("ka-GE")} ₾ (${label})`
  }
  if (min !== null && max !== null) {
    return `${min.toLocaleString("ka-GE")} – ${max.toLocaleString("ka-GE")} ₾ (${label})`
  }
  if (min !== null) {
    return `დან ${min.toLocaleString("ka-GE")} ₾ (${label})`
  }
  return "დაუზუსტებული"
}

export default function HirerPublicPage() {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [hirer, setHirer] = useState<HirerLoaded | null>(null)
  const [openJobs, setOpenJobs] = useState<OpenJobBrief[]>([])
  const [hirerReviews, setHirerReviews] = useState<HirerReviewDisplay[]>([])
  /** Shown only when logged-in viewer owns this hirer profile. */
  const [ownerVisitCount, setOwnerVisitCount] = useState<number | null>(null)

  const hirerRatingSummary = useMemo(() => {
    if (hirerReviews.length === 0) return { average: 0, count: 0 }
    const sum = hirerReviews.reduce((acc, r) => acc + r.rating_overall, 0)
    return { average: sum / hirerReviews.length, count: hirerReviews.length }
  }, [hirerReviews])

  useEffect(() => {
    document.title = "დამქირავებლის პროფილი — გიგორი"
  }, [])

  useEffect(() => {
    if (!UUID_RE.test(id ?? "")) {
      setLoading(false)
      setError("არასწორი იდენტიფიკატორი.")
      setHirer(null)
      setOpenJobs([])
      setHirerReviews([])
      return
    }

    const load = async () => {
      if (!id) return

      if (!isSupabaseConfigured || !supabase) {
        setLoading(false)
        setError("")
        setHirer({
          id,
          ownerUserId: "",
          companyName: "TechStart Georgia (დემო)",
          industry: "ტექნოლოგია",
          description: "Supabase რეჟიმში დაინახულეს დემო ტექსტი სრული პროფილისთვის.",
          websiteUrl: null,
          jobsPosted: 3,
          completedJobs: 8,
          contactName: "ლაშა რობაქიძე",
          avatarUrl: null,
          city: "თბილისი",
        })
        setOpenJobs([
          { id: "demo-job", title: "React Developer — კონტრაქტი", budgetMin: 800, budgetMax: 1200, budgetType: "fixed" },
        ])
        setHirerReviews([])
        document.title = "TechStart Georgia (დემო) — გიგორი"
        return
      }

      setLoading(true)
      setError("")
      try {
        const { data: row, error: hErr } = await supabase
          .from("hirer_profiles")
          .select(
            `
            id,
            user_id,
            company_name,
            description,
            industry,
            website_url,
            jobs_posted_count,
            completed_jobs_count,
            profiles:profiles!hirer_profiles_user_id_fkey (
              full_name,
              avatar_url,
              city
            )
          `,
          )
          .eq("id", id)
          .maybeSingle()

        if (hErr) throw hErr
        if (!row) {
          setHirer(null)
          setOpenJobs([])
          setHirerReviews([])
          setError("")
          document.title = "დამქირავებელი არ იძებნება — გიგორი"
          setLoading(false)
          return
        }

        const profile = joinedProfileOne(
          row.profiles as HirerJoinedProfile | HirerJoinedProfile[] | null | undefined,
        )
        const company = row.company_name?.trim() || "დამქირავებელი"
        document.title = `${company} — გიგორი`

        const ownerUserId = String(row.user_id ?? "")

        const [
          { data: jobRows, error: jErr },
          { count: completedCount, error: cjErr },
          { count: listingCompletedCount, error: listingCompletedErr },
          { data: reviewRows, error: revErr },
        ] = await Promise.all([
          supabase
            .from("jobs")
            .select("id, title, budget_min, budget_max, budget_type")
            .eq("hirer_profile_id", id)
            .eq("status", "open")
            .order("created_at", { ascending: false })
            .limit(20),
          supabase.from("completed_jobs").select("id", { count: "exact", head: true }).eq("hirer_profile_id", id),
          supabase
            .from("service_inquiries")
            .select("id", { count: "exact", head: true })
            .eq("hirer_profile_id", id)
            .eq("status", "completed"),
          supabase
            .from("reviews")
            .select("id, reviewer_id, review_text, rating_overall, created_at")
            .eq("reviewee_id", ownerUserId)
            .order("created_at", { ascending: false })
            .limit(100),
        ])

        if (jErr) throw jErr
        if (cjErr && import.meta.env.DEV) {
          console.warn("[HirerPublic] completed_jobs count:", cjErr.message)
        }
        if (listingCompletedErr && import.meta.env.DEV) {
          console.warn("[HirerPublic] service_inquiries completed count:", listingCompletedErr.message)
        }

        const jobCompleted =
          typeof completedCount === "number" ? completedCount : Number(row.completed_jobs_count ?? 0)
        const listingDone =
          typeof listingCompletedCount === "number" && !listingCompletedErr ? listingCompletedCount : 0
        const completedJobsLive = (cjErr ? Number(row.completed_jobs_count ?? 0) : jobCompleted) + listingDone

        setHirer({
          id: row.id,
          ownerUserId,
          companyName: company,
          industry: row.industry ?? null,
          description: row.description ?? null,
          websiteUrl: row.website_url ?? null,
          jobsPosted: Number(row.jobs_posted_count ?? 0),
          completedJobs: completedJobsLive,
          contactName: profile?.full_name?.trim() || "საკონტაქტო პირი",
          avatarUrl: profile?.avatar_url ?? null,
          city: profile?.city ?? null,
        })

        const jobsMapped: OpenJobBrief[] = (jobRows ?? []).map((j: any) => ({
          id: j.id,
          title: j.title ?? "",
          budgetMin: j.budget_min != null ? Number(j.budget_min) : null,
          budgetMax: j.budget_max != null ? Number(j.budget_max) : null,
          budgetType: j.budget_type ?? "fixed",
        }))
        setOpenJobs(jobsMapped)

        if (revErr) {
          if (import.meta.env.DEV) console.warn("[HirerPublic] reviews:", revErr.message)
          setHirerReviews([])
        } else {
          const rawReviews = (reviewRows ?? []) as Array<{
            id: string
            reviewer_id: string
            review_text: string
            rating_overall: number
            created_at: string
          }>
          const reviewerIds = Array.from(new Set(rawReviews.map((r) => r.reviewer_id)))
          let reviewerMap: Record<string, string> = {}
          if (reviewerIds.length > 0) {
            const { data: reviewersData, error: reviewersError } = await supabase
              .from("profiles")
              .select("id, full_name")
              .in("id", reviewerIds)
            if (!reviewersError && reviewersData) {
              reviewerMap = reviewersData.reduce<Record<string, string>>((acc, p) => {
                acc[p.id] = p.full_name
                return acc
              }, {})
            }
          }
          setHirerReviews(
            rawReviews.map((r) => ({
              ...r,
              reviewer_name: reviewerMap[r.reviewer_id] ?? "ფრილანსერი",
            })),
          )
        }

        void recordProfileVisit({
          kind: "hirer",
          hirerProfileId: row.id,
          profileOwnerUserId: String(row.user_id ?? ""),
        })
      } catch (e) {
        const message =
          e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : ""
        setError(message || "დეტალების ჩატვირთვა ვერ მოხერხდა.")
        setHirer(null)
        setOpenJobs([])
        setHirerReviews([])
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id])

  useEffect(() => {
    if (!hirer?.ownerUserId || !isSupabaseConfigured || !supabase) {
      setOwnerVisitCount(null)
      return
    }

    const client = supabase
    let cancelled = false

    const loadVisitCountIfOwner = async () => {
      const {
        data: { session },
      } = await client.auth.getSession()
      if (!session?.user?.id || session.user.id !== hirer.ownerUserId) {
        if (!cancelled) setOwnerVisitCount(null)
        return
      }
      const n = await countHirerProfileVisits(hirer.id)
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
  }, [hirer?.id, hirer?.ownerUserId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FC]">
        <Navbar />
        <main className="mx-auto w-full max-w-[720px] px-4 py-8 md:px-6">
          <SkeletonCard />
          <SkeletonCard />
        </main>
      </div>
    )
  }

  if (UUID_RE.test(id ?? "") && !hirer && !error) {
    return (
      <div className="min-h-screen bg-[#F8F9FC]">
        <Navbar />
        <main className="mx-auto w-full max-w-[720px] px-4 py-16 text-center md:px-6">
          <p className="text-xl font-bold text-[#1B2B4B]">დამქირავებელი ვერ მოიძებნა</p>
          <Link to="/hirers" className="mt-6 inline-flex h-11 items-center rounded-lg bg-[#1B2B4B] px-5 text-sm font-semibold text-white">
            ყველა დამქირავებელზე
          </Link>
        </main>
      </div>
    )
  }

  if ((error || !hirer) && !UUID_RE.test(id ?? "")) {
    return (
      <div className="min-h-screen bg-[#F8F9FC]">
        <Navbar />
        <main className="mx-auto w-full max-w-[720px] px-4 py-8 md:px-6">
          {error ? <ErrorState message={error} /> : <ErrorState message="არასწორი ბმული." />}
          <Link to="/hirers" className="mt-6 inline-block text-sm font-semibold text-[#1B2B4B] hover:text-[#D4A843]">
            ← დამქირავებლები
          </Link>
        </main>
      </div>
    )
  }

  if (!hirer) {
    return (
      <div className="min-h-screen bg-[#F8F9FC]">
        <Navbar />
        <main className="mx-auto w-full max-w-[720px] px-4 py-8 md:px-6">
          <ErrorState message={error || "არ ხელმისაწვდომია."} />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] page-enter">
      <Navbar />
      <main className="mx-auto w-full max-w-[720px] px-4 py-6 md:px-6 md:py-10">
        <Link to="/hirers" className="mb-6 inline-block text-sm font-semibold text-[#1B2B4B] hover:text-[#D4A843]">
          ← დამქირავებლები
        </Link>

        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#1B2B4B]/5 text-lg font-black text-[#1B2B4B]">
              {hirer.avatarUrl ? (
                <img src={hirer.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                companyInitials(hirer.companyName)
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-extrabold text-[#1B2B4B]">{hirer.companyName}</h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {[hirer.industry, hirer.city].filter(Boolean).join(" · ") || "Georgia"}
              </p>
              <p className="mt-2 text-sm text-slate-700">საკონტაქტო: {hirer.contactName}</p>
              <p className="mt-2 text-sm font-semibold text-[#D4A843]">
                {hirerRatingSummary.count === 0 ? (
                  <span className="text-slate-500">შეფასებები ჯერ არ არის</span>
                ) : (
                  <>
                    {ratingStars(hirerRatingSummary.average)} {hirerRatingSummary.average.toFixed(1)} ·{" "}
                    {hirerRatingSummary.count} შეფასება
                  </>
                )}
              </p>
              {hirer.websiteUrl ? (
                <a
                  href={hirer.websiteUrl.startsWith("http") ? hirer.websiteUrl : `https://${hirer.websiteUrl}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-block text-sm font-semibold text-[#D4A843] underline"
                >
                  ვებგვერდი
                </a>
              ) : null}
            </div>
          </div>
          <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-6 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-slate-500">აქტიური განცხადებები</dt>
              <dd className="mt-1 text-lg font-black text-[#1B2B4B]">{openJobs.length}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs uppercase text-slate-500">სტატისტიკა</dt>
              <dd className="mt-1 break-words text-lg font-black text-[#1B2B4B] [overflow-wrap:anywhere]">
                განცხადებები: {hirer.jobsPosted} · დასრულებული: {hirer.completedJobs}
              </dd>
            </div>
            {ownerVisitCount !== null ? (
              <div>
                <dt className="text-xs uppercase text-slate-500">საჯარო ნახვები (ვიზიტორები)</dt>
                <dd
                  className="mt-1 text-lg font-black tabular-nums text-[#1B2B4B]"
                  title="ხელმისაწვდომია მხოლოდ პროფილის მფლობელისთვის"
                >
                  {ownerVisitCount}
                </dd>
              </div>
            ) : null}
          </dl>
          {hirer.description ? (
            <div className="mt-6 border-t border-slate-100 pt-6">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">აღწერა</h2>
              <p className="mt-3 break-words whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 [overflow-wrap:anywhere]">
                {hirer.description}
              </p>
            </div>
          ) : null}
        </header>

        {hirerReviews.length > 0 ? (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="border-l-4 border-[#D4A843] pl-3 text-lg font-extrabold text-[#1B2B4B]">შეფასებები</h2>
            <ul className="mt-4 space-y-3">
              {hirerReviews.map((review) => (
                <li key={review.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1B2B4B] text-xs font-bold text-white">
                      {reviewerInitials(review.reviewer_name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-[#1B2B4B]">{review.reviewer_name}</p>
                      <p className="text-xs text-slate-500">{formatDate(review.created_at)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[#D4A843]">
                    {ratingStars(review.rating_overall)} {review.rating_overall.toFixed(1)}
                  </p>
                  <p className="mt-2 break-words text-sm text-slate-700 [overflow-wrap:anywhere]">{review.review_text}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-[#1B2B4B]">აქტიური განცხადებები:</h2>
            <Link to="/jobs" className="text-sm font-semibold text-[#1B2B4B] hover:text-[#D4A843]">
              მეტის ნახვა სამუშაოებში →
            </Link>
          </div>
          {openJobs.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
              ამ წუთას არც ერთი ვაკანსია არ ჩანს.
            </p>
          ) : (
            <ul className="space-y-3">
              {openJobs.map((job) => (
                <li key={job.id}>
                  <Link
                    to={`/job/${job.id}`}
                    className="block min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#D4A843]/70"
                  >
                    <p className="break-words font-bold text-[#1B2B4B] [overflow-wrap:anywhere]">{job.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{formatBudget(job)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
