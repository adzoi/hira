import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { type HomeFreelancerServiceItem, type HomeJobListingItem } from "../lib/homeFeed.ts"
import { useHomeFeedQuery } from "../lib/queries/useHomeFeedQuery.ts"
import { formatJobBudget, formatListingPrice } from "../lib/listingPrice.ts"
import { OptimizedImage } from "./OptimizedImage.tsx"
import { ViewCountEyeIcon } from "./ViewCountEyeIcon.tsx"
import VipBadge from "./VipBadge.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { formatCityForDisplay } from "../lib/marketplaceFilters.ts"
import type { AppLocale } from "../i18n/types.ts"
import { pickCategoryName } from "../lib/categoryLocale.ts"
import { pickListingDescription, pickListingTitle } from "../lib/listingLocale.ts"

function getInitials(fullName: string) {
  const parts = fullName.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "ფ"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function formatRelativeTime(
  dateString: string,
  t: (key: string, params?: Record<string, string | number>) => string,
  locale: AppLocale,
) {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < hour) {
    return t("nav.minutesAgo", { count: Math.max(1, Math.floor(diffMs / minute)) })
  }
  if (diffMs < day) {
    return t("nav.hoursAgo", { count: Math.max(1, Math.floor(diffMs / hour)) })
  }
  if (diffMs < 30 * day) {
    return t("nav.daysAgo", { count: Math.max(1, Math.floor(diffMs / day)) })
  }
  return new Date(dateString).toLocaleDateString(locale === "en" ? "en-US" : "ka-GE")
}

function jobBudgetLabel(job: HomeJobListingItem) {
  return formatJobBudget(job.budgetMin, job.budgetMax, job.budgetType)
}

function locationGlyph(type: string) {
  return type === "remote" ? "🌐" : "📍"
}

function locationLabel(
  type: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const labels: Record<string, string> = {
    remote: t("common.remote"),
    tbilisi: "თბილისი",
    hybrid: t("common.hybrid"),
    anywhere: t("common.anywhere"),
    on_site: t("common.onSite"),
  }
  return labels[type] ?? type
}

function showHirerRatingValue(value: number) {
  return Number.isFinite(value) && value > 0
}

/** Category / skill chips — text may wrap for long tokens */
const tagChipClass =
  "inline-flex max-w-full items-center rounded-full border border-[#D1D5DB] bg-white px-2.5 py-0.5 text-xs font-medium text-[#374151] [overflow-wrap:anywhere]"
/** Hirer job meta row — hug content, single line per pill, natural wrap across rows */
const metaPillJobClass =
  "inline-flex w-fit max-w-full min-w-0 shrink-0 items-center whitespace-nowrap rounded-full border border-[#D1D5DB] bg-white px-2.5 py-0.5 text-xs font-medium text-[#374151]"
/** Freelancer listing meta — content-sized pills with 4px×12px padding */
const metaPillFreelancerClass =
  "inline-flex w-fit max-w-full min-w-0 shrink-0 items-center whitespace-nowrap rounded-full border border-[#D1D5DB] bg-white px-3 py-1 text-xs font-medium text-[#374151]"

/** Long tokens (no spaces / URLs) must stay inside marketplace cards — grid/flex defaults allow overflow otherwise. */
const wrapText = "min-w-0 break-words [overflow-wrap:anywhere]"

const PAGE_SIZE = 20

function FreelancerFeedCard({ item }: { item: HomeFreelancerServiceItem }) {
  const { t, locale } = useTranslation()
  const negotiable = item.priceNegotiable
  const displayTitle = pickListingTitle(
    { title: item.title, titleEn: item.titleEn },
    locale,
    t("listingDetail.defaultTitle"),
  )
  const displayDescription = pickListingDescription(
    { description: item.descriptionPreview, descriptionEn: item.descriptionEnPreview },
    locale,
  )
  return (
    <li className="flex h-full min-h-0 max-w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 border-l-[3px] border-l-transparent bg-white p-4 shadow-sm transition-[border-left-color,box-shadow] duration-200 ease-out hover:border-l-[#0088FF] hover:shadow-[-4px_0_12px_rgba(0,136,255,0.25)]">
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="text-xs font-medium text-slate-500">{t("home.freelancerService")}</p>
        <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-amber-500">
          <span className="text-gray-900">{item.averageRating.toFixed(1)}</span>
        </div>

        <Link
          to={`/freelancer/${encodeURIComponent(item.freelancerSlug)}`}
          className="group mt-3 flex shrink-0 items-center gap-3"
        >
          <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-bold text-[#1B2B4B]">
            {item.avatarUrl ? (
              <OptimizedImage
                src={avatarImageUrl(supabase, item.avatarUrl) ?? item.avatarUrl}
                alt=""
                width={56}
                height={56}
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials(item.fullName)
            )}
          </span>
          <div className="min-w-0 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-bold text-gray-900 group-hover:text-[#0088FF]">{item.fullName}</p>
              {item.vipFeatured ? <VipBadge /> : null}
            </div>
            <p className="truncate text-xs text-slate-500">{item.professionalTitle || t("auth.freelancer")}</p>
          </div>
        </Link>

        <h2 className={`mt-3 line-clamp-2 text-lg font-bold text-gray-900 ${wrapText}`}>{displayTitle}</h2>
        <p className={`mt-3 line-clamp-2 text-sm leading-relaxed text-slate-600 ${wrapText}`}>{displayDescription}</p>
        {item.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.tags.slice(0, 4).map((tag) => (
              <span key={tag} className={tagChipClass}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap content-start gap-2 border-t border-slate-100 pt-4">
          <span className={metaPillFreelancerClass}>
            {formatListingPrice(item.price, item.priceType, { negotiable })}
          </span>
          <span className={`${metaPillFreelancerClass} gap-1`}>
            <ViewCountEyeIcon className="h-3.5 w-3.5 shrink-0 text-[#374151]" />
            {item.viewsCount}
          </span>
        </div>
      </div>
      <div className="mt-auto flex w-full shrink-0 flex-col gap-2 pt-3 sm:flex-row">
        <Link
          to={`/listing/${encodeURIComponent(item.id)}`}
          className="inline-flex h-10 min-h-10 w-full min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-lg bg-[#0088FF] px-3 text-sm font-bold text-white transition hover:bg-[#006ACC]"
        >
          {t("common.viewDetails")}
        </Link>
        <Link
          to={`/freelancer/${encodeURIComponent(item.freelancerSlug)}`}
          className="inline-flex h-10 min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-lg border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-gray-900 transition hover:border-slate-400"
        >
          {t("nav.profile")}
        </Link>
      </div>
    </li>
  )
}

function JobListingFeedCard({ item }: { item: HomeJobListingItem }) {
  const { t, locale } = useTranslation()
  const showRating = showHirerRatingValue(item.hirerAverageRating)
  const displayTitle = pickListingTitle({ title: item.title, titleEn: item.titleEn }, locale, item.title)
  const displayDescription = pickListingDescription(
    { description: item.descriptionPreview, descriptionEn: item.descriptionEnPreview },
    locale,
  )
  const categoryLabel = pickCategoryName(
    { name_ka: item.categoryNameKa, name_en: item.categoryNameEn },
    locale,
  )
  const subcategoryLabel =
    item.subcategoryNameKa != null
      ? pickCategoryName(
          { name_ka: item.subcategoryNameKa, name_en: item.subcategoryNameEn },
          locale,
        )
      : null
  return (
    <li className="flex h-full min-h-0 max-w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 border-l-[3px] border-l-transparent bg-white p-4 shadow-sm transition-[border-left-color,box-shadow] duration-200 ease-out hover:border-l-[#0088FF] hover:shadow-[-4px_0_12px_rgba(0,136,255,0.25)]">
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="text-xs font-medium text-slate-500">{t("home.hirerListing")}</p>
        {showRating ? (
          <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-amber-500">
            <span className="text-gray-900">{item.hirerAverageRating.toFixed(1)}</span>
          </div>
        ) : null}

        <div className="mt-3 flex items-start gap-3">
          {item.companyAvatar ? (
            <OptimizedImage
              src={avatarImageUrl(supabase, item.companyAvatar) ?? item.companyAvatar}
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#1B2B4B] text-sm font-bold text-white">
              {getInitials(item.companyName)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-gray-900">{item.companyName}</p>
                  {item.vipFeatured ? <VipBadge /> : null}
                </div>
                <p className={`mt-0.5 text-xs text-slate-500 ${wrapText}`}>
                  {[formatCityForDisplay(item.city), formatRelativeTime(item.createdAt, t, locale)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {item.isUrgent ? (
                <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                  {t("common.urgent")}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <Link to={`/job/${encodeURIComponent(item.id)}`} className="group mt-3 block">
          <h2 className={`text-lg font-bold text-gray-900 group-hover:text-[#0088FF] md:text-xl ${wrapText}`}>{displayTitle}</h2>
        </Link>

        <div className="mt-2 flex flex-wrap gap-2">
          <span className={tagChipClass}>{categoryLabel}</span>
          {subcategoryLabel ? <span className={tagChipClass}>{subcategoryLabel}</span> : null}
        </div>

        <p className={`mt-3 line-clamp-2 text-sm leading-relaxed text-slate-600 ${wrapText}`}>{displayDescription}</p>

        <div className="mt-4 flex flex-wrap content-start gap-2 border-t border-slate-100 pt-4">
          <span className={metaPillJobClass}>{jobBudgetLabel(item)}</span>
          <span className={metaPillJobClass}>
            {locationGlyph(item.locationType)} {locationLabel(item.locationType, t)}
          </span>
          <span className={metaPillJobClass}>
            💼 {t("common.applicants", { count: item.applicantsCount })}
          </span>
        </div>
      </div>

      <div className="mt-auto w-full shrink-0 pt-3">
        <Link
          to={`/job/${encodeURIComponent(item.id)}`}
          className="inline-flex h-10 min-h-10 w-full items-center justify-center whitespace-nowrap rounded-lg bg-[#0088FF] px-4 text-sm font-bold text-white transition hover:bg-[#006ACC]"
        >
          {t("common.viewDetails")}
        </Link>
      </div>
    </li>
  )
}

export default function HomeFeedSection() {
  const { t } = useTranslation()
  const { data: items = [], isLoading: loading } = useHomeFeedQuery()
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  /** Guests default to talent (freelancer listings); logged-in users default to the opposite role’s content. */
  const [feedFilter, setFeedFilter] = useState<"all" | "freelancer" | "hirer">("freelancer")
  const appliedRoleDefaultTab = useRef(false)

  useEffect(() => {
    let cancelled = false
    const syncDefaultTabWithRole = async () => {
      if (!isSupabaseConfigured || !supabase) {
        appliedRoleDefaultTab.current = true
        return
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (cancelled || appliedRoleDefaultTab.current) return
      if (!user) {
        setFeedFilter("freelancer")
        appliedRoleDefaultTab.current = true
        return
      }
      const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", user.id).maybeSingle()
      if (cancelled || appliedRoleDefaultTab.current) return
      const ut = profile?.user_type
      if (ut === "freelancer") setFeedFilter("hirer")
      else if (ut === "hirer") setFeedFilter("freelancer")
      else setFeedFilter("freelancer")
      appliedRoleDefaultTab.current = true
    }
    void syncDefaultTabWithRole()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredItems =
    feedFilter === "all"
      ? items
      : items.filter((item) => (feedFilter === "freelancer" ? item.kind === "freelancer_service" : item.kind === "hirer_job"))

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [feedFilter])

  const visible = filteredItems.slice(0, visibleCount)
  const hasMore = visible.length < filteredItems.length

  return (
    <section className="border-y border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6 md:py-14">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1">
            <h2 className="mt-2 text-2xl font-bold text-[#0088FF] md:text-[28px]">{t("home.servicesAndJobs")}</h2>
          </div>
          <div className="w-full shrink-0 lg:w-auto lg:max-w-none">
            <div className="flex max-w-full flex-nowrap items-center justify-end gap-2 overflow-x-auto pl-1 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setFeedFilter("all")}
                className={`inline-flex h-10 min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition ${
                  feedFilter === "all"
                    ? "border-transparent bg-[#0088FF] text-white"
                    : "border-[#D1D5DB] bg-white text-slate-600 hover:border-slate-400 hover:text-slate-700"
                }`}
              >
                {t("common.all")}
              </button>
              <button
                type="button"
                onClick={() => setFeedFilter("freelancer")}
                className={`inline-flex h-10 min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition ${
                  feedFilter === "freelancer"
                    ? "border-transparent bg-[#0088FF] text-white"
                    : "border-[#D1D5DB] bg-white text-slate-600 hover:border-slate-400 hover:text-slate-700"
                }`}
              >
                {t("nav.freelancers")}
              </button>
              <button
                type="button"
                onClick={() => setFeedFilter("hirer")}
                className={`inline-flex h-10 min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition ${
                  feedFilter === "hirer"
                    ? "border-transparent bg-[#0088FF] text-white"
                    : "border-[#D1D5DB] bg-white text-slate-600 hover:border-slate-400 hover:text-slate-700"
                }`}
              >
                {t("nav.hirers")}
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-200/60" />
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            {t("home.noOffersYet")}{" "}
            <Link className="font-semibold text-[#0088FF] underline" to="/listings">
              {t("home.servicesCatalog")}
            </Link>{" "}
            ·{" "}
            <Link className="font-semibold text-[#0088FF] underline" to="/jobs">
              {t("nav.jobs")}
            </Link>
          </p>
        ) : (
          <>
            <ul className="mt-8 grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((item) =>
                item.kind === "freelancer_service" ? (
                  <FreelancerFeedCard key={`f-${item.id}`} item={item} />
                ) : (
                  <JobListingFeedCard key={`j-${item.id}`} item={item} />
                ),
              )}
            </ul>
            {hasMore ? (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="h-11 rounded-lg border border-[#0088FF] px-6 text-sm font-semibold text-[#0088FF] transition hover:bg-[#E8F4FF]"
                >
                  {t("common.loadMore")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
