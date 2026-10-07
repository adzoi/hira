import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import FollowListsModal, { type FollowModalTab } from "../components/FollowListsModal.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { usePageMeta } from "../lib/usePageMeta.tsx"
import FreelancerDashboard from "./dashboard/FreelancerDashboard.tsx"
import HirerDashboard from "./dashboard/HirerDashboard.tsx"
import { useDashboardData } from "./dashboard/useDashboardData.ts"

/** Shell: loads dashboard data once, then hands off to the freelancer or hirer home screen. */
export default function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const data = useDashboardData()
  const { loading, displayError, profile, successMessage, setSuccessMessage } = data
  const [followListsModalOpen, setFollowListsModalOpen] = useState(false)
  const [followListsModalTab, setFollowListsModalTab] = useState<FollowModalTab>("followers")

  useEffect(() => {
    const state = location.state as { successMessage?: string } | null
    if (!state?.successMessage) return

    setSuccessMessage(state.successMessage)
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: null,
    })
  }, [location.hash, location.pathname, location.search, location.state, navigate, setSuccessMessage])

  const openFollowList = (tab: FollowModalTab) => {
    setFollowListsModalTab(tab)
    setFollowListsModalOpen(true)
  }

  return (
    <>
    {usePageMeta(t("dashboard.title"), t("dashboard.metaDescription"))}

    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1B2B4B]">{t("dashboard.heading")}</h1>
        </div>

        {!loading && !displayError && successMessage ? (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-green-700">
            {successMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="flex h-60 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#D4A843]" />
          </div>
        ) : displayError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{displayError}</div>
        ) : profile?.user_type === "freelancer" ? (
          <FreelancerDashboard data={data} onOpenFollowList={openFollowList} />
        ) : profile?.user_type === "hirer" ? (
          <HirerDashboard data={data} onOpenFollowList={openFollowList} />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
            მომხმარებლის ტიპი ვერ მოიძებნა.
          </div>
        )}
        {!loading && !displayError && profile ? (
          <FollowListsModal
            open={followListsModalOpen}
            onClose={() => setFollowListsModalOpen(false)}
            profileId={profile.id}
            initialTab={followListsModalTab}
          />
        ) : null}
      </main>
    </div>
  </>
  )
}
