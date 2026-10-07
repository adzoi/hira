import { useMemo } from "react"
import { Link } from "react-router-dom"
import { FollowStatPills, type FollowModalTab } from "../../components/FollowListsModal.tsx"
import { useTranslation } from "../../i18n/LocaleContext.tsx"
import type { HirerApplicationRow, JobRow } from "./dashboardShared.ts"

type Props = {
  name: string
  followerCount: number
  followingCount: number
  onOpenFollowList: (tab: FollowModalTab) => void
  myJobs: JobRow[]
  applications: HirerApplicationRow[]
  onCompare: (jobId: string) => void
  onShowApplicants: () => void
}

/** Hirer home card: one main action - review waiting applicants, or post / invite when there are none. */
export default function HirerHero({
  name,
  followerCount,
  followingCount,
  onOpenFollowList,
  myJobs,
  applications,
  onCompare,
  onShowApplicants,
}: Props) {
  const { t } = useTranslation()

  const waiting = useMemo(() => {
    const openJobs = new Map(myJobs.filter((j) => j.status === "open").map((j) => [j.id, j.title]))
    const byJob = new Map<string, number>()
    for (const app of applications) {
      if (app.status !== "pending" || !openJobs.has(app.jobId)) continue
      byJob.set(app.jobId, (byJob.get(app.jobId) ?? 0) + 1)
    }
    const ranked = [...byJob.entries()].sort((a, b) => b[1] - a[1])
    return {
      openJobCount: openJobs.size,
      total: ranked.reduce((sum, [, n]) => sum + n, 0),
      top: ranked[0] ? { jobId: ranked[0][0], count: ranked[0][1], title: openJobs.get(ranked[0][0]) ?? "" } : null,
      otherJobs: Math.max(0, ranked.length - 1),
    }
  }, [myJobs, applications])

  const primaryBtn =
    "inline-flex h-11 items-center justify-center rounded-lg bg-[#0088FF] px-5 text-sm font-semibold text-white transition hover:bg-[#006ACC]"
  const secondaryBtn =
    "inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-[#1B2B4B] transition hover:border-[#0088FF]"

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">{t("dashHome.hello", { name: name || t("dashHome.hirerFallback") })}</h2>
        <FollowStatPills
          followerCount={followerCount}
          followingCount={followingCount}
          onOpenFollowers={() => onOpenFollowList("followers")}
          onOpenFollowing={() => onOpenFollowList("following")}
        />
      </div>

      <div className="mt-5 rounded-xl bg-[#E8F4FF] p-5">
        {waiting.top ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#0088FF]">{t("dashHome.nextStep")}</p>
            <p className="mt-1 text-lg font-bold text-[#1B2B4B]">
              {t("dashHome.applicantsWaiting", { count: waiting.top.count, job: waiting.top.title })}
            </p>
            {waiting.otherJobs > 0 ? (
              <p className="mt-1 text-sm text-slate-600">{t("dashHome.moreJobsWaiting", { count: waiting.otherJobs, total: waiting.total })}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => onCompare(waiting.top!.jobId)} className={primaryBtn}>
                {t("dashHome.compareCta")}
              </button>
              <button type="button" onClick={onShowApplicants} className={secondaryBtn}>
                {t("dashHome.allApplicants")}
              </button>
            </div>
          </>
        ) : waiting.openJobCount === 0 ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#0088FF]">{t("dashHome.nextStep")}</p>
            <p className="mt-1 text-lg font-bold text-[#1B2B4B]">{t("dashHome.noJobs")}</p>
            <p className="mt-1 text-sm text-slate-600">{t("dashHome.noJobsHint")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/post-job" className={primaryBtn}>{t("dashHome.postJob")}</Link>
              <Link to="/freelancers" className={secondaryBtn}>{t("dashHome.browseFreelancers")}</Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#0088FF]">{t("dashHome.nextStep")}</p>
            <p className="mt-1 text-lg font-bold text-[#1B2B4B]">{t("dashHome.allQuiet")}</p>
            <p className="mt-1 text-sm text-slate-600">{t("dashHome.allQuietHint")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/freelancers" className={primaryBtn}>{t("dashHome.inviteCta")}</Link>
              <Link to="/post-job" className={secondaryBtn}>{t("dashHome.postAnother")}</Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
