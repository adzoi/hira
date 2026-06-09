import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import VIPUpgrade from "../components/VIPUpgrade.tsx"
import { ViewCountEyeIcon } from "../components/ViewCountEyeIcon.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import { useToast } from "../components/ui/ToastProvider.tsx"
import SaveBookmarkButton from "../components/SaveBookmarkButton.tsx"
import StartConversationButton from "../components/StartConversationButton.tsx"
import { avatarImageUrl, jobImageDetailUrl, jobImageThumbnailUrl } from "../lib/storageImageUrl.ts"
import { fetchJobDetail, loadHirerContact, type JobDetailQueryResult } from "../lib/queries/fetchJobDetail.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { jobVacancyStats } from "../lib/jobVacancies.ts"
import { formatJobBudget, jobApplicationRateLabel } from "../lib/listingPrice.ts"
import { formatHirerContactForApplicant, hirerContactCopyText } from "../lib/jobContactPreference.ts"
import { validateCoverLetter, validateMoneyAmount } from "../lib/validation.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { usePageMeta } from "../lib/usePageMeta.ts"
import { pickListingTitle } from "../lib/listingLocale.ts"
import { displayJobDescription } from "../lib/jobDescriptionDisplay.ts"

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

function CalendarOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

const detailCardClass = "rounded-2xl border border-slate-200 bg-white shadow-sm"
const sidebarCardClass = `${detailCardClass} flex min-h-[580px] flex-col md:min-h-[620px]`

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
    staleTime: 0,
    refetchOnMount: "always",
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
  const [selectedImage, setSelectedImage] = useState(0)
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

  usePageMeta(t("jobDetail.title"), t("jobDetail.metaDescription"))

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

  const displayDescription = useMemo(() => {
    if (!job) return ""
    return displayJobDescription(job, locale)
  }, [job, locale])

  const imagePublicUrls = useMemo(() => {
    if (!job) return []
    const client = supabase
    if (!client) return []
    return job.image_urls.map((path) => ({
      thumb: jobImageThumbnailUrl(client, path),
      detail: jobImageDetailUrl(client, path),
    }))
  }, [job])

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
      <div className="bg-slate-50 page-enter">
        <main className="mx-auto flex w-full max-w-[1100px] flex-col px-4 py-4 md:px-6 md:py-5">
          <div className="grid min-h-[420px] flex-1 grid-cols-1 gap-4 md:grid-cols-2">
            <SkeletonCard lines={8} />
            <SkeletonCard lines={8} avatar />
          </div>
        </main>
      </div>
    )
  }

  if (!job) {
    const headline = error.trim().length > 0 ? error : t("jobDetail.notFound")
    return (
      <div className="bg-slate-50 page-enter">
        <main className="mx-auto flex w-full max-w-[1100px] flex-col px-4 py-4 md:px-6 md:py-5">
          <div className={`${detailCardClass} items-center justify-center p-8 text-center`}>
            <p className="text-lg font-semibold text-[#1B2B4B]">{headline}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-4 inline-flex h-10 items-center rounded-lg border border-[#1B2B4B] bg-white px-4 text-sm font-semibold text-[#1B2B4B] transition hover:bg-[#1B2B4B] hover:text-white"
            >
              {t("common.tryAgain")}
            </button>
            <Link to="/jobs" className="mt-4 block text-sm font-semibold text-[#0088FF] hover:underline">
              {t("common.backToJobs")}
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 page-enter">
      <main className="mx-auto flex w-full max-w-[1100px] flex-col px-4 py-4 md:px-6 md:py-5">
        <Link
          to="/jobs"
          className="mb-3 inline-flex shrink-0 items-center gap-1 text-sm font-medium text-slate-600 transition hover:text-[#0088FF]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("common.backToJobs")}
        </Link>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch">
          <article className={`${detailCardClass} flex min-h-[420px] flex-col p-4 md:min-h-[620px] md:p-5`}>
            <div className="flex shrink-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="min-w-0 text-xl font-bold leading-snug text-[#1B2B4B] md:text-2xl">{displayTitle}</h1>
                  {job.vipActive ? (
                    <span className="rounded-full bg-[#D4A843] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1B2B4B]">
                      VIP
                    </span>
                  ) : null}
                  {job.is_urgent ? (
                    <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-[10px] font-semibold text-white">
                      {t("common.urgent")}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <ViewCountEyeIcon className="h-3.5 w-3.5" />
                    {t("common.views", { count: job.views_count })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarOutlineIcon className="h-3.5 w-3.5" />
                    {formatRelativeTime(job.created_at)}
                  </span>
                </div>
              </div>
              {!isJobOwner ? (
                <SaveBookmarkButton variant="icon" resourceType="job" resourceId={job.id} />
              ) : null}
            </div>

            {imagePublicUrls.length > 0 ? (
              <div className="mt-3 shrink-0">
                <div className="overflow-hidden rounded-xl bg-slate-100">
                  <img
                    src={imagePublicUrls[Math.min(selectedImage, imagePublicUrls.length - 1)].detail}
                    alt=""
                    width={800}
                    height={450}
                    className="h-36 w-full object-cover md:h-44"
                  />
                </div>
                {imagePublicUrls.length > 1 ? (
                  <div className="mt-2 flex gap-1.5 overflow-x-auto">
                    {imagePublicUrls.map((urls, index) => (
                      <button
                        key={urls.thumb}
                        type="button"
                        onClick={() => setSelectedImage(index)}
                        className={`h-12 w-14 shrink-0 overflow-hidden rounded-md border-2 ${
                          selectedImage === index ? "border-[#0088FF]" : "border-slate-200"
                        }`}
                      >
                        <img
                          src={urls.thumb}
                          alt=""
                          width={80}
                          height={80}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-3 flex-1">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {displayDescription || t("listingDetail.noDescription")}
              </p>
              {(job.skills ?? []).length > 0 ? (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <h2 className="text-sm font-semibold text-[#1B2B4B]">{t("jobDetail.requiredSkills")}</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(job.skills ?? []).map((skill) => (
                      <span
                        key={skill.id}
                        className="rounded-full border border-[#D4A843] px-3 py-1 text-xs font-medium text-[#1B2B4B]"
                      >
                        {skill.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </article>

          <aside className={`${sidebarCardClass} p-4 md:p-5`}>
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 pb-4">
              <Link
                to={`/hirer/${job.hirer_profile_id}`}
                className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-bold text-[#1B2B4B]"
              >
                {job.hirer_avatar_url ? (
                  <img
                    src={avatarImageUrl(supabase, job.hirer_avatar_url) ?? job.hirer_avatar_url}
                    alt=""
                    width={56}
                    height={56}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  getInitials(job.hirer_company_name)
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/hirer/${job.hirer_profile_id}`}
                  className="block truncate font-bold text-[#1B2B4B] hover:text-[#0088FF]"
                >
                  {job.hirer_company_name}
                </Link>
                <p className="truncate text-sm text-slate-600">{t("common.contactLabel", { name: job.hirer_full_name })}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t("common.memberSince", { date: formatDate(job.hirer_member_since) })}
                </p>
              </div>
            </div>

            <div className="mt-4 shrink-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("common.budget")}</p>
              <p className="text-2xl font-bold text-[#1B2B4B]">{budgetText}</p>
            </div>

            <div className="mt-3 shrink-0 text-xs leading-relaxed text-slate-600">
              <p>
                {[
                  t("common.durationLabel", {
                    value: job.duration_type === "one_time" ? t("jobDetail.oneTime") : t("jobDetail.ongoing"),
                  }),
                  t("common.locationLabel", { value: job.location_type }),
                  t("common.categoryLabel", { value: job.category_name }),
                  t("common.deadlineLabel", {
                    date: job.application_deadline ? formatDate(job.application_deadline) : t("common.notSpecified"),
                  }),
                ].join(" · ")}
              </p>
              <p className="mt-1.5 font-semibold text-[#1B2B4B]">
                {t("common.vacanciesFilled", {
                  filled: vacancySnap?.acceptedCount ?? 0,
                  total: vacancySnap?.vacancies ?? 1,
                })}
                {" · "}
                {vacancySnap?.isFull ? t("jobs.vacancyFull") : t("jobs.spotsFree", { count: vacancySnap?.remaining ?? 0 })}
              </p>
            </div>

            {isJobOwner ? (
              <div className="mt-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setVipModalOpen(true)}
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-[#D4A843] bg-amber-50 px-4 text-sm font-semibold text-[#1B2B4B] transition hover:bg-[#D4A843]/50"
                >
                  {t("jobDetail.vipUpgrade")}
                </button>
              </div>
            ) : null}

            {!isJobOwner ? (
              <div className="mt-4 flex shrink-0 flex-wrap gap-2">
                {job.hirer_user_id ? (
                  <StartConversationButton
                    otherUserId={job.hirer_user_id}
                    jobApplicationId={jobApplicationId}
                    className="shrink-0"
                  />
                ) : null}
                <Link
                  to={`/hirer/${job.hirer_profile_id}`}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-[#0088FF] px-3 text-sm font-semibold text-white hover:bg-[#006ACC]"
                >
                  {t("nav.profile")}
                </Link>
                <SaveBookmarkButton variant="icon" resourceType="hirer" resourceId={job.hirer_profile_id} />
              </div>
            ) : null}

            {canViewHirerContact ? (
              <button
                type="button"
                onClick={() => void copyContact()}
                className="mt-3 inline-flex h-9 w-full shrink-0 items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-[#1B2B4B] hover:bg-slate-50"
              >
                {t("common.copyContactInfo")}
              </button>
            ) : null}

            <div className="mt-4 border-t border-slate-100 pt-4">
              {!supabase || authedUserType === "guest" ? (
                <div>
                  <p className="text-sm text-slate-700">{t("jobDetail.signupToApply")}</p>
                  <Link
                    to="/register"
                    className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#1B2B4B] px-4 text-sm font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]"
                  >
                    {t("nav.register")}
                  </Link>
                </div>
              ) : authedUserType === "hirer" && !isJobOwner ? (
                <p className="text-sm font-semibold text-slate-700">{t("jobDetail.youAreHirer")}</p>
              ) : authedUserType === "freelancer" && alreadyApplied ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
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
              ) : authedUserType === "freelancer" && (job.status !== "open" || (vacancySnap?.isFull ?? false)) ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  {t("jobDetail.applicationClosed")}
                </div>
              ) : authedUserType === "freelancer" && !isJobOwner ? (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-[#1B2B4B]">{t("common.sendApplication")}</p>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-slate-500">{t("nav.comment")}</span>
                    <textarea
                      value={coverLetter}
                      onChange={(event) => setCoverLetter(event.target.value)}
                      rows={4}
                      placeholder={t("common.coverLetterPlaceholder")}
                      className="block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none ring-[#0088FF] focus:ring-2"
                    />
                  </label>
                  <div className="flex items-end gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="mb-2 block text-xs font-semibold text-slate-500">{rateLabel}</span>
                      <input
                        type="number"
                        min={0}
                        value={proposedRate}
                        onChange={(event) => setProposedRate(event.target.value)}
                        className="block h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#0088FF] focus:ring-2"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleApply()}
                      className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-[#0088FF] px-4 text-sm font-semibold text-white hover:bg-[#006ACC] disabled:opacity-60"
                    >
                      {submitting ? t("common.inProgress") : t("common.sendApplication")}
                    </button>
                  </div>
                  {submitError ? <p className="text-xs text-red-600">{submitError}</p> : null}
                  {submitSuccess ? <p className="text-xs text-green-700">{submitSuccess}</p> : null}
                </div>
              ) : null}

              {otherJobs.length > 0 ? (
                <div className="mt-4 shrink-0 border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-bold text-[#1B2B4B]">{t("jobDetail.otherListings")}</h3>
                  <div className="mt-2 space-y-2">
                    {otherJobs.map((other) => (
                      <Link
                        key={other.id}
                        to={`/job/${other.id}`}
                        className="block rounded-lg border border-slate-200 p-3 hover:border-[#0088FF]"
                      >
                        <p className="font-semibold text-[#1B2B4B]">{other.title}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {formatJobBudget(other.budget_min, other.budget_max, other.budget_type)}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
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
