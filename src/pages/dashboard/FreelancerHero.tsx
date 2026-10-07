import { Link } from "react-router-dom"
import { FollowStatPills, type FollowModalTab } from "../../components/FollowListsModal.tsx"
import { useTranslation } from "../../i18n/LocaleContext.tsx"
import { useRecommendedJobs } from "../../lib/queries/useRecommendedJobs.ts"
import { formatBudget } from "./dashboardShared.ts"

type Props = {
  userId: string
  name: string
  followerCount: number
  followingCount: number
  onOpenFollowList: (tab: FollowModalTab) => void
  /** Hirer offers on the freelancer's listings still waiting for an answer. */
  pendingListingOffers: number
  onShowListingOffers: () => void
}

/** Freelancer home card: one main action - apply to jobs that match your skills. */
export default function FreelancerHero({
  userId,
  name,
  followerCount,
  followingCount,
  onOpenFollowList,
  pendingListingOffers,
  onShowListingOffers,
}: Props) {
  const { t, locale } = useTranslation()
  const { data, isLoading } = useRecommendedJobs(userId)
  const jobs = (data?.jobs ?? []).slice(0, 3)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-2xl font-bold text-[#1B2B4B]">{t("dashboard.hello", { name: name || t("auth.freelancer") })}</h2>
        <FollowStatPills
          followerCount={followerCount}
          followingCount={followingCount}
          onOpenFollowers={() => onOpenFollowList("followers")}
          onOpenFollowing={() => onOpenFollowList("following")}
        />
      </div>

      {pendingListingOffers > 0 ? (
        <button
          type="button"
          onClick={onShowListingOffers}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-lg border border-[#D4A843] bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-[#1B2B4B] transition hover:bg-amber-100"
        >
          <span>{t("dashHome.offersWaiting", { count: pendingListingOffers })}</span>
          <span className="shrink-0 text-[#D4A843]">{t("dashHome.answer")} →</span>
        </button>
      ) : null}

      <div className="mt-5 rounded-xl bg-[#E8F4FF] p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#0088FF]">{t("dashHome.nextStep")}</p>
        <p className="mt-1 text-lg font-bold text-[#1B2B4B]">{t("dashHome.jobsForYou")}</p>

        {isLoading ? (
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-white/70" />
            ))}
          </div>
        ) : jobs.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {jobs.map((job) => {
              const title = locale === "en" && job.titleEn ? job.titleEn : job.title
              return (
                <li key={job.id}>
                  <Link
                    to={`/job/${job.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white bg-white px-4 py-3 transition hover:border-[#0088FF]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#1B2B4B]">{title}</p>
                      <p className="truncate text-xs text-slate-500">
                        {job.companyName} · {formatBudget(job.budgetMin, job.budgetMax, t)}
                        {job.applicantsCount > 0 ? ` · ${t("dashHome.applicantsCount", { count: job.applicantsCount })}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-[#0088FF] px-3 py-1.5 text-xs font-semibold text-white">
                      {t("dashHome.apply")}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-600">{t("dashHome.noMatches")}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/jobs"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-[#0088FF] px-5 text-sm font-semibold text-white transition hover:bg-[#006ACC]"
          >
            {t("dashHome.allJobs")}
          </Link>
          {jobs.length === 0 && !isLoading ? (
            <Link
              to="/profile"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-[#1B2B4B] transition hover:border-[#0088FF]"
            >
              {t("dashHome.addSkills")}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
