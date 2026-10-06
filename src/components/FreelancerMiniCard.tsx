import { Link } from "react-router-dom"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { formatCityForDisplay } from "../lib/marketplaceFilters.ts"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { supabase } from "../lib/supabase"
import { OptimizedImage } from "./OptimizedImage.tsx"

/** Shape returned by the landing / similar-freelancers RPCs. */
export type FreelancerMiniCardData = {
  slug: string
  full_name: string | null
  avatar_url: string | null
  city: string | null
  professional_title: string | null
  average_rating: number | null
  total_reviews_count: number | null
  completed_jobs_count: number | null
  starting_price: number | null
  skills: string[] | null
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  )
}

/** Compact freelancer card for landing pages and "similar freelancers" rails. */
export default function FreelancerMiniCard({ freelancer }: { freelancer: FreelancerMiniCardData }) {
  const { t, locale } = useTranslation()
  const name = freelancer.full_name?.trim() || t("nav.user")
  const avatar = avatarImageUrl(supabase, freelancer.avatar_url)
  const rating = Number(freelancer.average_rating ?? 0)
  const reviews = Number(freelancer.total_reviews_count ?? 0)
  const city = formatCityForDisplay(freelancer.city, locale)

  return (
    <Link
      to={`/freelancer/${encodeURIComponent(freelancer.slug)}`}
      className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-center gap-3">
        {avatar ? (
          <OptimizedImage
            src={avatar}
            alt={t("common.avatarAlt", { name })}
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#1B2B4B] text-base font-bold text-white">
            {initials(name)}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-bold text-[#1B2B4B]">{name}</p>
          {freelancer.professional_title ? (
            <p className="truncate text-sm text-slate-500">{freelancer.professional_title}</p>
          ) : null}
          {city ? <p className="truncate text-xs text-slate-400">📍 {city}</p> : null}
        </div>
      </div>

      {freelancer.skills && freelancer.skills.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {freelancer.skills.slice(0, 4).map((skill) => (
            <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
              {skill}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 text-sm">
        <span className="text-slate-500">
          {reviews > 0 ? (
            <>
              <span className="font-semibold text-[#1B2B4B]">★ {rating.toFixed(1)}</span> ·{" "}
              {t("common.reviewsCount", { count: reviews })}
            </>
          ) : (
            t("common.completed", { count: Number(freelancer.completed_jobs_count ?? 0) })
          )}
        </span>
        <span className="font-semibold text-[#1B2B4B]">
          {freelancer.starting_price && freelancer.starting_price > 0
            ? t("common.fromPrice", { price: Number(freelancer.starting_price) })
            : t("common.priceOnRequest")}
        </span>
      </div>
    </Link>
  )
}
