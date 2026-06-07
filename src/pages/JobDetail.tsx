import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import VIPUpgrade from "../components/VIPUpgrade.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import { useToast } from "../components/ui/ToastProvider.tsx"
import SaveBookmarkButton from "../components/SaveBookmarkButton.tsx"
import StartConversationButton from "../components/StartConversationButton.tsx"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { fetchJobDetail, loadHirerContact, type JobDetailQueryResult } from "../lib/queries/fetchJobDetail.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { jobVacancyStats } from "../lib/jobVacancies.ts"
import { formatJobBudget, jobApplicationRateLabel } from "../lib/listingPrice.ts"
import { formatHirerContactForApplicant, hirerContactCopyText } from "../lib/jobContactPreference.ts"
import { validateCoverLetter, validateMoneyAmount } from "../lib/validation.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { pickListingDescription, pickListingTitle } from "../lib/listingLocale.ts"

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

export default function JobDetailPage() {
  const { t, locale } = useTranslation()
  const { pushToast } = useToast()
  const queryClient = useQueryClient()
  const { id } = useParams()
  const {
    data,
    isLoading: loading,
    isError,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.jobDetail(id ?? ""),
    queryFn: () => fetchJobDetail(id!),
    enabled: Boolean(id) && isSupabaseConfigured,
  })
  const error = !id
    ? "სამუშაო ვერ მოიძებნა"
    : !isSupabaseConfigured
      ? "Supabase არ არის კონფიგურირებული."
      : isError
        ? queryErrorMessage(queryError, "მონაცემები ვერ ჩაიტვირთა.")
        : ""
  const job = data?.job ?? null
  const otherJobs = data?.otherJobs ?? []
  const [authedUserType, setAuthedUserType] = useState<"freelancer" | "hirer" | "guest">("guest")
  const [freelancerProfileId, setFreelancerProfileId] = useState<string | null>(null)
  const [alreadyApplied, setAlreadyApplied] = useState(false)
  const [jobApplicationId, setJobApplicationId] = useState<string | null>(null)
  const [coverLetter, setCoverLetter] = useState("")
  const [proposedRate, setProposedRate] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [submitSuccess, setSubmitSuccess] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [viewerUserId, setViewerUserId] = useState<string | null>(null)
  const [hirerContact, setHirerContact] = useState<{ email: string; phone: string | null } | null>(null)
  const [vipModalOpen, setVipModalOpen] = useState(false)
  const trackedJobViewRef = useRef<string | null>(null)

  useEffect(() => {
    if (!data) return
    setAuthedUserType(data.authedUserType)
    setFreelancerProfileId(data.freelancerProfileId)
    setAlreadyApplied(data.alreadyApplied)
    setJobApplicationId(data.jobApplicationId)
    setViewerUserId(data.viewerUserId)
    setHirerContact(data.hirerContact)
  }, [data])

  useEffect(() => {
    document.title = t("jobDetail.title")
    return () => {
      document.title = t("brand.name")
    }
  }, [t])

  useEffect(() => {
    if (!supabase || !job?.id) return
    if (trackedJobViewRef.current === job.id) return
    trackedJobViewRef.current = job.id
    void (async () => {
      try {
        const { data: viewCount, error: viewError } = await supabase.rpc("increment_job_views", { p_job_id: job.id })
        if (viewError) return
        const next = Number(viewCount ?? 0)
        if (!Number.isFinite(next)) return
        queryClient.setQueryData<JobDetailQueryResult>(queryKeys.jobDetail(job.id), (prev) =>
          prev?.job && prev.job.id === job.id ? { ...prev, job: { ...prev.job, views_count: next } } : prev,
        )
      } catch {
        /* non-blocking */
      }
    })()
  }, [job?.id, queryClient])

  const budgetText = useMemo(() => {
    if (!job) return ""
    return formatJobBudget(job.budget_min, job.budget_max, job.budget_type)
  }, [job])

  const rateLabel = useMemo(() => {
    if (!job) return t("common.proposedRateDefault")
    return jobApplicationRateLabel(job.budget_type)
  }, [job, t])

  const isJobOwner =
    Boolean(job) && authedUserType === "hirer" && Boolean(viewerUserId) && viewerUserId === job!.hirer_user_id

  const canViewHirerContact = Boolean(hirerContact) && (alreadyApplied || isJobOwner)

  const vacancySnap = job ? jobVacancyStats(job.vacancies, job.accepted_count) : null

  const displayTitle = useMemo(
    () =>
      job ? pickListingTitle({ title: job.title, titleEn: job.titleEn }, locale, job.title) : "",
    [job, locale],
  )

  const displayDescription = useMemo(
    () =>
      job
        ? pickListingDescription(
            { description: job.description, descriptionEn: job.descriptionEn },
            locale,
          )
        : "",
    [job, locale],
  )

  const handleApply = async () => {
    if (!supabase || !job || !freelancerProfileId) return
    setSubmitError("")
    setSubmitSuccess("")

    const coverResult = validateCoverLetter(coverLetter)
    if (coverResult.ok === false) {
      setSubmitError(coverResult.message)
      return
    }

    let rateNote: string | null = null
    if (proposedRate.trim()) {
      const rateResult = validateMoneyAmount(proposedRate, { min: 0, label: "ტარიფი" })
      if (rateResult.ok === false) {
        setSubmitError(rateResult.message)
        return
      }
      if (rateResult.value == null) {
        setSubmitError("შემოთავაზებული ტარიფი არასწორია.")
        return
      }
      rateNote = `შემოთავაზებული ტარიფი: ₾${rateResult.value}`
    }

    const vs = jobVacancyStats(job.vacancies, job.accepted_count)
    if (job.status !== "open" || vs.isFull) {
      setSubmitError("ამ განცხადებაზე ახალი შეთავაზების გაგზავნა შეუძლებელია.")
      return
    }

    setSubmitting(true)
    try {
      const noteParts: string[] = []
      if (coverResult.value) noteParts.push(coverResult.value)
      if (rateNote) noteParts.push(rateNote)
      const coverNote = noteParts.length > 0 ? noteParts.join("\n\n") : null

      const { data: inserted, error: applyError } = await supabase
        .from("job_applications")
        .insert({
          job_id: job.id,
          freelancer_profile_id: freelancerProfileId,
          cover_note: coverNote,
          status: "pending",
        })
        .select("id")
        .single()
      if (applyError) throw applyError

      setAlreadyApplied(true)
      if (inserted?.id) setJobApplicationId(inserted.id)
      const contactRow = await loadHirerContact(job.id)
      if (contactRow) setHirerContact(contactRow)
      const contact = formatHirerContactForApplicant({
        contactPreference: job.contact_preference,
        email: contactRow?.email ?? "",
        phone: contactRow?.phone ?? null,
      })
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
    if (!job || !hirerContact) return
    const value = hirerContactCopyText({
      contactPreference: job.contact_preference,
      email: hirerContact.email,
      phone: hirerContact.phone,
    })
    if (!value) return
    await navigator.clipboard.writeText(value)
    pushToast({ type: "info", message: "კოპირებულია!" })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
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
    const headline = error.trim().length > 0 ? error : t("jobDetail.notFound")
    return (
      <div className="min-h-screen bg-slate-50">
        <main className="mx-auto max-w-[1000px] px-6 py-10">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-5xl opacity-70" aria-hidden>
              ❗
            </p>
            <p className="mt-4 text-xl font-semibold text-[#1B2B4B]">{headline}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-6 h-11 rounded-lg border border-[#1B2B4B] bg-white px-5 text-sm font-semibold text-[#1B2B4B] transition hover:bg-[#1B2B4B] hover:text-white"
            >
              {t("common.tryAgain")}
            </button>
          </div>
          <div className="mt-6 text-center">
            <Link to="/jobs" className="text-sm font-semibold text-[#D4A843] hover:underline">
              {t("common.backToJobs")}
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-[1000px] px-6 py-10">
        <div className="grid gap-6 lg:grid-cols-[1.8fr,1fr]">
          <section className="space-y-6">
            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="min-w-0 flex-1 text-3xl font-bold text-[#1B2B4B]">{displayTitle}</h1>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {!isJobOwner ? (
                    <SaveBookmarkButton variant="icon" resourceType="job" resourceId={job.id} />
                  ) : null}
                  {job.vipActive ? (
                    <span className="rounded-full bg-[#D4A843] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#1B2B4B]">
                      VIP · Featured
                    </span>
                  ) : null}
                  {job.is_urgent ? (
                    <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white">
                      {t("common.urgent")}
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
                    {t("jobDetail.vipUpgrade")}
                  </button>
                </div>
              ) : null}
              <p className="mt-2 text-sm text-slate-500">
                {formatRelativeTime(job.created_at)} • {t("common.views", { count: job.views_count })}
              </p>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{displayDescription}</p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">{t("jobDetail.requiredSkills")}</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {(job.skills ?? []).map((skill) => (
                  <span key={skill.id} className="rounded-full border border-[#D4A843] px-3 py-1 text-xs font-medium text-[#1B2B4B]">
                    {skill.name}
                  </span>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">{t("common.budget")}</h2>
              <p className="mt-4 text-lg font-bold text-[#1B2B4B]">
                {t("common.budgetLabel", { value: budgetText })}
              </p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">{t("common.details")}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  {t("common.durationLabel", {
                    value: job.duration_type === "one_time" ? t("jobDetail.oneTime") : t("jobDetail.ongoing"),
                  })}
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-sm">{t("common.locationLabel", { value: job.location_type })}</div>
                <div className="rounded-lg bg-slate-50 p-3 text-sm">{t("common.categoryLabel", { value: job.category_name })}</div>
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  {t("common.deadlineLabel", {
                    date: job.application_deadline ? formatDate(job.application_deadline) : t("common.notSpecified"),
                  })}
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-sm sm:col-span-2">
                  <span className="font-semibold text-[#1B2B4B]">
                    {t("common.vacanciesFilled", {
                      filled: vacancySnap?.acceptedCount ?? 0,
                      total: vacancySnap?.vacancies ?? 1,
                    })}
                  </span>
                  {" "}
                  <span className="text-slate-600">
                    ({vacancySnap?.acceptedCount ?? 0} of {vacancySnap?.vacancies ?? 1} vacancies filled)
                  </span>
                  {" · "}
                  <span className="text-slate-700">
                    {vacancySnap?.isFull
                      ? t("jobs.vacancyFull")
                      : t("jobs.spotsFree", { count: vacancySnap?.remaining ?? 0 })}
                  </span>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              {!supabase || authedUserType === "guest" ? (
                <div>
                  <p className="text-sm text-slate-700">{t("jobDetail.signupToApply")}</p>
                  <Link to="/register" className="mt-3 inline-flex h-10 items-center rounded-lg bg-[#1B2B4B] px-4 text-sm font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]">
                    {t("nav.register")}
                  </Link>
                </div>
              ) : authedUserType === "hirer" ? (
                <p className="text-sm font-semibold text-slate-700">{t("jobDetail.youAreHirer")}</p>
              ) : alreadyApplied ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
                    {t("common.applicationSent")}
                  </div>
                  {job.hirer_user_id ? (
                    <StartConversationButton
                      otherUserId={job.hirer_user_id}
                      jobApplicationId={jobApplicationId}
                      variant="primary"
                      className="w-full"
                    />
                  ) : null}
                </div>
              ) : job.status !== "open" || (vacancySnap?.isFull ?? false) ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  {t("jobDetail.applicationClosed")}
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("nav.comment")}</span>
                    <textarea
                      value={coverLetter}
                      onChange={(event) => setCoverLetter(event.target.value)}
                      rows={5}
                      placeholder={t("common.coverLetterPlaceholder")}
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
                    className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#1B2B4B] px-5 text-sm font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-60"
                  >
                    {submitting ? t("common.inProgress") : t("common.sendApplication")}
                  </button>
                  {job.hirer_user_id ? (
                    <StartConversationButton
                      otherUserId={job.hirer_user_id}
                      className="w-full"
                    />
                  ) : null}
                </div>
              )}
            </article>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  {job.hirer_avatar_url ? (
                    <img
                      src={avatarImageUrl(supabase, job.hirer_avatar_url) ?? job.hirer_avatar_url}
                      alt={t("common.avatarAlt", { name: job.hirer_company_name })}
                      loading="lazy"
                      className="h-14 w-14 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#1B2B4B] text-sm font-bold text-white">
                      {getInitials(job.hirer_company_name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-[#1B2B4B]">{job.hirer_company_name}</p>
                    <p className="text-xs text-slate-500">{t("common.memberSince", { date: formatDate(job.hirer_member_since) })}</p>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600">{t("jobDetail.postedListingsCount", { count: job.hirer_jobs_posted_count })}</p>
              {canViewHirerContact ? (
                <button type="button" onClick={copyContact} className="mt-3 inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-[#1B2B4B]">
                  {t("common.copyContactInfo")}
                </button>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <SaveBookmarkButton variant="icon" resourceType="hirer" resourceId={job.hirer_profile_id} />
                {!isJobOwner && job.hirer_user_id ? (
                  <StartConversationButton
                    otherUserId={job.hirer_user_id}
                    jobApplicationId={jobApplicationId}
                    className="min-w-[10rem] flex-1"
                  />
                ) : null}
                <Link
                  to={`/hirer/${job.hirer_profile_id}`}
                  className="inline-flex min-h-[44px] min-w-0 flex-1 items-center justify-center rounded-lg border border-transparent px-3 py-2 text-center text-sm font-semibold text-[#D4A843] underline hover:bg-amber-50/60 sm:flex-none sm:justify-start"
                >
                  {t("nav.viewProfile")}
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-[#1B2B4B]">{t("jobDetail.otherListings")}</h3>
              <div className="mt-3 space-y-2">
                {otherJobs.length === 0 ? (
                  <p className="text-sm text-slate-500">{t("jobDetail.noOtherJobs")}</p>
                ) : (
                  otherJobs.map((other) => (
                    <Link key={other.id} to={`/job/${other.id}`} className="block rounded-lg border border-slate-200 p-3 hover:border-[#D4A843]">
                      <p className="font-semibold text-[#1B2B4B]">{other.title}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {formatJobBudget(other.budget_min, other.budget_max, other.budget_type)}
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
          onSuccess={() => void refetch()}
        />
      ) : null}
    </div>
  )
}
