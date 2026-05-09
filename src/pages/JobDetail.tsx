import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import VIPUpgrade from "../components/VIPUpgrade.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import { useToast } from "../components/ui/ToastProvider.tsx"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { jobVacancyStats } from "../lib/jobVacancies.ts"
import { jobVipIsActive } from "../lib/vipJobTiers.ts"

type JobData = {
  id: string
  title: string
  description: string
  status: string
  vacancies: number
  accepted_count: number
  created_at: string
  views_count: number
  is_urgent: boolean
  budget_type: string
  budget_min: number | null
  budget_max: number | null
  duration_type: string
  location_type: string
  application_deadline: string | null
  category_name: string
  subcategory_name: string | null
  skills: Array<{ id: string; name: string }>
  hirer_profile_id: string
  hirer_company_name: string
  hirer_jobs_posted_count: number
  hirer_user_id: string
  hirer_full_name: string
  hirer_avatar_url: string | null
  hirer_city: string | null
  hirer_member_since: string
  hirer_email: string
  hirer_phone: string | null
  contact_preference: string
  is_vip: boolean
  vip_tier: string | null
  vip_expires_at: string | null
  vipActive: boolean
}

type OtherJob = { id: string; title: string; budget_min: number | null; budget_max: number | null; budget_type: string }

function formatDate(dateString: string) {
  if (!dateString.trim()) return "—"
  const t = new Date(dateString).getTime()
  if (!Number.isFinite(t)) return "—"
  return new Date(dateString).toLocaleDateString("ka-GE")
}

function formatRelativeTime(dateString: string) {
  if (!dateString.trim()) return "—"
  const parsed = new Date(dateString).getTime()
  if (!Number.isFinite(parsed)) return "—"
  const now = Date.now()
  const diffMs = now - parsed
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))} წუთის წინ`
  if (diffMs < day) return `${Math.max(1, Math.floor(diffMs / hour))} საათის წინ`
  if (diffMs < 30 * day) return `${Math.max(1, Math.floor(diffMs / day))} დღის წინ`
  return new Date(dateString).toLocaleDateString("ka-GE")
}

function getInitials(value: string) {
  const parts = value.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "დ"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

/** PostgREST + RLS sometimes yields null, []; normalize to one row or null before reading fields. */
function normalizeSingleRelation<T extends Record<string, unknown>>(embedded: unknown): T | null {
  if (embedded == null) return null
  if (Array.isArray(embedded)) {
    const first = embedded[0]
    return first != null && typeof first === "object" ? (first as T) : null
  }
  if (typeof embedded === "object") return embedded as T
  return null
}

export default function JobDetailPage() {
  const { pushToast } = useToast()
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [job, setJob] = useState<JobData | null>(null)
  const [otherJobs, setOtherJobs] = useState<OtherJob[]>([])
  const [authedUserType, setAuthedUserType] = useState<"freelancer" | "hirer" | "guest">("guest")
  const [freelancerProfileId, setFreelancerProfileId] = useState<string | null>(null)
  const [alreadyApplied, setAlreadyApplied] = useState(false)
  const [coverLetter, setCoverLetter] = useState("")
  const [proposedRate, setProposedRate] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [submitSuccess, setSubmitSuccess] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [viewerUserId, setViewerUserId] = useState<string | null>(null)
  const [vipModalOpen, setVipModalOpen] = useState(false)
  const trackedJobViewRef = useRef<string | null>(null)

  useEffect(() => {
    document.title = "სამუშაოები — გიგორი"
    return () => {
      document.title = "გიგორი"
    }
  }, [])

  useEffect(() => {
    if (!supabase || !job?.id) return
    if (trackedJobViewRef.current === job.id) return
    trackedJobViewRef.current = job.id
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("increment_job_views", { p_job_id: job.id })
        if (error) return
        const next = Number(data ?? 0)
        if (!Number.isFinite(next)) return
        setJob((prev) => (prev && prev.id === job.id ? { ...prev, views_count: next } : prev))
      } catch {
        /* non-blocking */
      }
    })()
  }, [job?.id])

  const loadData = async () => {
      if (!id) {
        setJob(null)
        setError("სამუშაო ვერ მოიძებნა")
        setLoading(false)
        return
      }

      if (!isSupabaseConfigured || !supabase) {
        setJob(null)
        setError("Supabase არ არის კონფიგურირებული.")
        setLoading(false)
        return
      }

      setLoading(true)
      setError("")
      setJob(null)
      setOtherJobs([])
      setAlreadyApplied(false)
      setFreelancerProfileId(null)
      setAuthedUserType("guest")
      setViewerUserId(null)

      try {
        const { data: jobRow, error: jobError } = await supabase
          .from("jobs")
          .select(`
            *,
            categories (name_ka),
            subcategories (name_ka),
            hirer_profiles (
              id,
              user_id,
              company_name,
              jobs_posted_count,
              profiles:profiles!hirer_profiles_user_id_fkey (full_name, avatar_url, city, member_since, email, phone)
            ),
            job_skills (
              skills (id, name)
            )
          `)
          .eq("id", id)
          .maybeSingle()

        let rowUnknown: Record<string, unknown> | null = null
        if (jobRow == null || jobRow === undefined) {
          rowUnknown = null
        } else if (Array.isArray(jobRow)) {
          const first = jobRow[0]
          rowUnknown = first != null && typeof first === "object" && !Array.isArray(first) ? (first as Record<string, unknown>) : null
        } else if (typeof jobRow === "object") {
          rowUnknown = jobRow as Record<string, unknown>
        }

        if (jobError || rowUnknown == null || typeof rowUnknown.id !== "string") {
          setError("")
          setJob(null)
          return
        }

        const hirerProfilesRaw = normalizeSingleRelation<Record<string, unknown>>(
          (jobRow as { hirer_profiles?: unknown }).hirer_profiles ?? rowUnknown.hirer_profiles,
        )
        const hirerP =
          hirerProfilesRaw?.profiles !== undefined && hirerProfilesRaw.profiles !== null
            ? normalizeSingleRelation<Record<string, unknown>>(hirerProfilesRaw.profiles)
            : null

        const jobSkillsUnknown = rowUnknown.job_skills
        const jobSkillsRows = Array.isArray(jobSkillsUnknown) ? jobSkillsUnknown : []

        const hirerProfileIdSafe =
          hirerProfilesRaw && typeof hirerProfilesRaw.id === "string" ? hirerProfilesRaw.id : ""
        const hirerUserIdSafe =
          hirerProfilesRaw && typeof hirerProfilesRaw.user_id === "string" ? hirerProfilesRaw.user_id : ""

        const vacStats = jobVacancyStats(rowUnknown.vacancies as number | null | undefined, rowUnknown.accepted_count as number | null | undefined)

        const mappedJob: JobData = {
          id: String(rowUnknown.id),
          title: String(rowUnknown.title ?? ""),
          description: String(rowUnknown.description ?? ""),
          status: String(rowUnknown.status ?? "open"),
          vacancies: vacStats.vacancies,
          accepted_count: vacStats.acceptedCount,
          created_at: String(rowUnknown.created_at ?? ""),
          views_count: Number(rowUnknown.views_count ?? 0),
          is_urgent: Boolean(rowUnknown.is_urgent),
          budget_type: String(rowUnknown.budget_type ?? ""),
          budget_min:
            rowUnknown.budget_min === null || rowUnknown.budget_min === undefined ? null : Number(rowUnknown.budget_min),
          budget_max:
            rowUnknown.budget_max === null || rowUnknown.budget_max === undefined ? null : Number(rowUnknown.budget_max),
          duration_type: String(rowUnknown.duration_type ?? ""),
          location_type: String(rowUnknown.location_type ?? ""),
          application_deadline:
            rowUnknown.application_deadline === null || rowUnknown.application_deadline === undefined
              ? null
              : String(rowUnknown.application_deadline),
          category_name:
            normalizeSingleRelation<{ name_ka?: string }>(rowUnknown.categories)?.name_ka?.trim() || "კატეგორია",
          subcategory_name:
            normalizeSingleRelation<{ name_ka?: string }>(rowUnknown.subcategories)?.name_ka?.trim() ?? null,
          skills: jobSkillsRows
            .map((item) =>
              normalizeSingleRelation<{ id?: unknown; name?: unknown }>((item as { skills?: unknown }).skills ?? null),
            )
            .filter(
              (s): s is { id: string; name: string } =>
                s != null &&
                typeof s.id === "string" &&
                s.id.length > 0 &&
                typeof s.name === "string" &&
                s.name.length > 0,
            )
            .map((skill) => ({ id: skill.id, name: skill.name })),
          hirer_profile_id: hirerProfileIdSafe,
          hirer_company_name:
            (typeof hirerProfilesRaw?.company_name === "string" && hirerProfilesRaw.company_name.trim()
              ? hirerProfilesRaw.company_name
              : null) ||
            (typeof hirerP?.full_name === "string" && hirerP.full_name.trim() ? hirerP.full_name : null) ||
            "დამქირავებელი",
          hirer_jobs_posted_count: Number(hirerProfilesRaw?.jobs_posted_count ?? 0),
          hirer_user_id: hirerUserIdSafe,
          hirer_full_name:
            (typeof hirerP?.full_name === "string" && hirerP.full_name.trim() ? hirerP.full_name : "") || "დამქირავებელი",
          hirer_avatar_url: hirerP?.avatar_url != null ? String(hirerP.avatar_url) : null,
          hirer_city: hirerP?.city != null ? String(hirerP.city) : null,
          hirer_member_since:
            hirerP?.member_since != null ? String(hirerP.member_since) : new Date().toISOString(),
          hirer_email: hirerP?.email != null ? String(hirerP.email) : "",
          hirer_phone: hirerP?.phone != null ? String(hirerP.phone) : null,
          contact_preference: String(rowUnknown.contact_preference ?? ""),
          is_vip: Boolean(rowUnknown.is_vip),
          vip_tier: rowUnknown.vip_tier != null ? String(rowUnknown.vip_tier) : null,
          vip_expires_at: rowUnknown.vip_expires_at != null ? String(rowUnknown.vip_expires_at) : null,
          vipActive: jobVipIsActive(Boolean(rowUnknown.is_vip), rowUnknown.vip_expires_at != null ? String(rowUnknown.vip_expires_at) : null),
        }

        if (!mappedJob.hirer_profile_id) {
          setError("")
          setJob(null)
          return
        }

        setJob(mappedJob)

        const { data: others, error: othersError } = await supabase
          .from("jobs")
          .select("id,title,budget_min,budget_max,budget_type")
          .eq("hirer_profile_id", mappedJob.hirer_profile_id)
          .eq("status", "open")
          .neq("id", mappedJob.id)
          .order("created_at", { ascending: false })
          .limit(3)
        if (othersError) throw othersError
        setOtherJobs((others ?? []) as OtherJob[])

        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          setAuthedUserType("guest")
          setViewerUserId(null)
          setLoading(false)
          return
        }
        setViewerUserId(user.id)

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id,user_type")
          .eq("id", user.id)
          .maybeSingle()
        if (profileError || !profile) {
          setAuthedUserType("guest")
          setViewerUserId(null)
          setLoading(false)
          return
        }

        if (profile.user_type === "freelancer") {
          setAuthedUserType("freelancer")
          const { data: fp, error: fpError } = await supabase
            .from("freelancer_profiles")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle()
          if (!fpError && fp) {
            setFreelancerProfileId(fp.id)
            const { data: applied, error: appliedError } = await supabase
              .from("job_applications")
              .select("id")
              .eq("job_id", mappedJob.id)
              .eq("freelancer_profile_id", fp.id)
              .maybeSingle()
            if (!appliedError && applied) setAlreadyApplied(true)
          }
        } else if (profile.user_type === "hirer") {
          setAuthedUserType("hirer")
        } else {
          setAuthedUserType("guest")
        }
      } catch (loadError) {
        setJob(null)
        setError(loadError instanceof Error ? loadError.message : "მონაცემები ვერ ჩაიტვირთა.")
      } finally {
        setLoading(false)
      }
    }

  useEffect(() => {
    loadData()
  }, [id])

  const budgetTypeLabel = useMemo(() => {
    if (!job) return ""
    if (job.budget_type === "fixed") return "ფიქსირებული"
    if (job.budget_type === "hourly") return "საათობრივი"
    if (job.budget_type === "monthly") return "თვიური"
    return job.budget_type
  }, [job])

  const budgetText = useMemo(() => {
    if (!job) return ""
    if (job.budget_type === "hourly") return `₾${job.budget_min ?? 0}/საათი`
    if (job.budget_type === "monthly") return `₾${job.budget_min ?? 0}/თვე`
    return `₾${job.budget_min ?? 0} - ₾${job.budget_max ?? 0}`
  }, [job])

  const rateLabel = useMemo(() => {
    if (!job) return "შემოთავაზებული ფასი (₾)"
    if (job.budget_type === "hourly") return "საათობრივი განაკვეთი (₾)"
    if (job.budget_type === "monthly") return "თვიური გასამრჯელო (₾)"
    return "შემოთავაზებული ფასი (₾)"
  }, [job])

  const isJobOwner =
    Boolean(job) && authedUserType === "hirer" && Boolean(viewerUserId) && viewerUserId === job!.hirer_user_id

  const vacancySnap = job ? jobVacancyStats(job.vacancies, job.accepted_count) : null

  const handleApply = async () => {
    if (!supabase || !job || !freelancerProfileId) return
    setSubmitError("")
    setSubmitSuccess("")

    if (coverLetter.trim().length > 0 && coverLetter.trim().length < 50) {
      setSubmitError("კომენტარი მინიმუმ 50 სიმბოლო უნდა იყოს ან დატოვე ცარიელი.")
      return
    }

    const vs = jobVacancyStats(job.vacancies, job.accepted_count)
    if (job.status !== "open" || vs.isFull) {
      setSubmitError("ამ განცხადებაზე ახალი განცხადება აღარ არის შესაძლებელი.")
      return
    }

    setSubmitting(true)
    try {
      const noteParts: string[] = []
      if (coverLetter.trim()) noteParts.push(coverLetter.trim())
      if (proposedRate.trim()) noteParts.push(`შემოთავაზებული ტარიფი: ₾${proposedRate.trim()}`)
      const coverNote = noteParts.length > 0 ? noteParts.join("\n\n") : null

      const { error: applyError } = await supabase.from("job_applications").insert({
        job_id: job.id,
        freelancer_profile_id: freelancerProfileId,
        cover_note: coverNote,
        status: "pending",
      })
      if (applyError) throw applyError

      setAlreadyApplied(true)
      const contact =
        job.contact_preference === "phone" && job.hirer_phone
          ? `ტელეფონი: ${job.hirer_phone}`
          : `ელფოსტა: ${job.hirer_email}`
      setSubmitSuccess(`განცხადება გაგზავნილია! დამქირავებელი დაგიკავშირდება: ${contact}`)
      pushToast({ type: "success", message: "განცხადება გაგზავნილია" })
    } catch (applyErr) {
      setSubmitError(applyErr instanceof Error ? applyErr.message : "გაგზავნა ვერ მოხერხდა.")
      pushToast({ type: "error", message: "შეცდომა მოხდა, სცადე თავიდან" })
    } finally {
      setSubmitting(false)
    }
  }

  const copyContact = async () => {
    if (!job) return
    const value = job.contact_preference === "phone" && job.hirer_phone ? job.hirer_phone : job.hirer_email
    if (!value) return
    await navigator.clipboard.writeText(value)
    pushToast({ type: "info", message: "კოპირებულია!" })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <main className="mx-auto max-w-[1000px] px-6 py-10">
          <div className="grid gap-4">
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
          </div>
        </main>
      </div>
    )
  }

  if (!job) {
    const headline = error.trim().length > 0 ? error : "სამუშაო ვერ მოიძებნა"
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <main className="mx-auto max-w-[1000px] px-6 py-10">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-5xl opacity-70" aria-hidden>
              ❗
            </p>
            <p className="mt-4 text-xl font-semibold text-[#1B2B4B]">{headline}</p>
            <button
              type="button"
              onClick={() => void loadData()}
              className="mt-6 h-11 rounded-lg border border-[#1B2B4B] bg-white px-5 text-sm font-semibold text-[#1B2B4B] transition hover:bg-[#1B2B4B] hover:text-white"
            >
              თავიდან ცდა
            </button>
          </div>
          <div className="mt-6 text-center">
            <Link to="/jobs" className="text-sm font-semibold text-[#D4A843] hover:underline">
              სამუშაოებზე დაბრუნება
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-[1000px] px-6 py-10">
        <div className="grid gap-6 lg:grid-cols-[1.8fr,1fr]">
          <section className="space-y-6">
            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-3xl font-bold text-[#1B2B4B]">{job.title}</h1>
                <div className="flex flex-wrap items-center gap-2">
                  {job.vipActive ? (
                    <span className="rounded-full bg-[#D4A843] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#1B2B4B]">
                      VIP · Featured
                    </span>
                  ) : null}
                  {job.is_urgent ? (
                    <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white">
                      გადაუდებელი
                    </span>
                  ) : null}
                </div>
              </div>
              {isJobOwner ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setVipModalOpen(true)}
                    className="inline-flex h-10 items-center rounded-lg border border-[#D4A843] bg-amber-50 px-4 text-sm font-semibold text-[#1B2B4B] transition hover:bg-[#D4A843]/50"
                  >
                    VIP / Featured გაუმჯობესება
                  </button>
                </div>
              ) : null}
              <p className="mt-2 text-sm text-slate-500">
                {formatRelativeTime(job.created_at)} • {job.views_count} ნახვა
              </p>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{job.description}</p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">საჭირო უნარები</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {(job.skills ?? []).map((skill) => (
                  <span key={skill.id} className="rounded-full border border-[#D4A843] px-3 py-1 text-xs font-medium text-[#1B2B4B]">
                    {skill.name}
                  </span>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">ბიუჯეტი</h2>
              <p className="mt-4 text-lg font-bold text-[#1B2B4B]">
                ბიუჯეტი: {budgetText} ({budgetTypeLabel})
              </p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">დეტალები</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3 text-sm">ხანგრძლივობა: {job.duration_type === "one_time" ? "ერთჯერადი" : "მიმდინარე"}</div>
                <div className="rounded-lg bg-slate-50 p-3 text-sm">ლოკაცია: {job.location_type}</div>
                <div className="rounded-lg bg-slate-50 p-3 text-sm">კატეგორია: {job.category_name}</div>
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  ვადა: {job.application_deadline ? formatDate(job.application_deadline) : "არ არის მითითებული"}
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-sm sm:col-span-2">
                  <span className="font-semibold text-[#1B2B4B]">
                    {vacancySnap?.acceptedCount ?? 0}/{vacancySnap?.vacancies ?? 1} ვაკანსია შევსებულია
                  </span>
                  {" "}
                  <span className="text-slate-600">
                    ({vacancySnap?.acceptedCount ?? 0} of {vacancySnap?.vacancies ?? 1} vacancies filled)
                  </span>
                  {" · "}
                  <span className="text-slate-700">
                    {vacancySnap?.isFull ? "დაკომლექტებულია · ახალი განცხადება აღარ იღებს" : `${vacancySnap?.remaining ?? 0} თავისუფალი ადგილი`}
                  </span>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              {!supabase || authedUserType === "guest" ? (
                <div>
                  <p className="text-sm text-slate-700">განცხადებაზე გამოსახმობლად გაიარე რეგისტრაცია</p>
                  <Link to="/register" className="mt-3 inline-flex h-10 items-center rounded-lg bg-[#1B2B4B] px-4 text-sm font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]">
                    რეგისტრაცია
                  </Link>
                </div>
              ) : authedUserType === "hirer" ? (
                <p className="text-sm font-semibold text-slate-700">თქვენ ხართ დამქირავებელი</p>
              ) : alreadyApplied ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
                  განცხადება გაგზავნილია ✓
                </div>
              ) : job.status !== "open" || (vacancySnap?.isFull ?? false) ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  ამ განცხადებაზე განცხადება ახლა აღარ იღებს — ყველა ადგილი შევსებულია ან განცხადება დაიხურა.
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">კომენტარი</span>
                    <textarea
                      value={coverLetter}
                      onChange={(event) => setCoverLetter(event.target.value)}
                      rows={5}
                      placeholder="შენი გამოცდილება და მიდგომა..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#D4A843] focus:ring-2"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{rateLabel}</span>
                    <input
                      type="number"
                      min={0}
                      value={proposedRate}
                      onChange={(event) => setProposedRate(event.target.value)}
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                    />
                  </label>

                  {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
                  {submitSuccess ? <p className="text-sm text-green-700">{submitSuccess}</p> : null}

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleApply}
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-[#1B2B4B] px-5 text-sm font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-60"
                  >
                    {submitting ? "მიმდინარეობს..." : "განცხადების გაგზავნა"}
                  </button>
                </div>
              )}
            </article>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                {job.hirer_avatar_url ? (
                  <img
                    src={avatarImageUrl(supabase, job.hirer_avatar_url) ?? job.hirer_avatar_url}
                    alt={`${job.hirer_company_name} ავატარი`}
                    loading="lazy"
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1B2B4B] text-sm font-bold text-white">
                    {getInitials(job.hirer_company_name)}
                  </div>
                )}
                <div>
                  <p className="font-bold text-[#1B2B4B]">{job.hirer_company_name}</p>
                  <p className="text-xs text-slate-500">წევრი: {formatDate(job.hirer_member_since)}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600">განთავსებული განცხადებები: {job.hirer_jobs_posted_count}</p>
              <button type="button" onClick={copyContact} className="mt-3 inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-[#1B2B4B]">
                საკონტაქტოს კოპირება
              </button>
              <Link to={`/hirer/${job.hirer_profile_id}`} className="mt-3 inline-flex text-sm font-semibold text-[#D4A843] hover:underline">
                პროფილის ნახვა
              </Link>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-[#1B2B4B]">სხვა განცხადებები</h3>
              <div className="mt-3 space-y-2">
                {otherJobs.length === 0 ? (
                  <p className="text-sm text-slate-500">სხვა განცხადებები არ არის.</p>
                ) : (
                  otherJobs.map((other) => (
                    <Link key={other.id} to={`/job/${other.id}`} className="block rounded-lg border border-slate-200 p-3 hover:border-[#D4A843]">
                      <p className="font-semibold text-[#1B2B4B]">{other.title}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {other.budget_type === "hourly"
                          ? `₾${other.budget_min ?? 0}/საათი`
                          : other.budget_type === "monthly"
                            ? `₾${other.budget_min ?? 0}/თვე`
                            : `₾${other.budget_min ?? 0} - ₾${other.budget_max ?? 0}`}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      </main>

      {job && isJobOwner ? (
        <VIPUpgrade
          open={vipModalOpen}
          jobId={job.id}
          jobTitle={job.title}
          onClose={() => setVipModalOpen(false)}
          onSuccess={() => void loadData()}
        />
      ) : null}
    </div>
  )
}
