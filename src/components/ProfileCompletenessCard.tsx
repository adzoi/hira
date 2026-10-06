import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import type { Database } from "../lib/database.types"
import {
  MIN_BIO_LENGTH,
  MIN_SKILLS,
  profileCompletenessItems,
  profileCompletenessPercent,
  type ProfileCompletenessCounts,
} from "../lib/profileCompleteness.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { supabase } from "../lib/supabase"

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
type FreelancerProfileRow = Database["public"]["Tables"]["freelancer_profiles"]["Row"]

async function fetchCompletenessCounts(freelancerProfileId: string): Promise<ProfileCompletenessCounts> {
  if (!supabase) return { skills: 0, activeServices: 0, experience: 0, education: 0 }

  const [skills, services, experience, education] = await Promise.all([
    supabase
      .from("freelancer_skills")
      .select("id", { count: "exact", head: true })
      .eq("freelancer_profile_id", freelancerProfileId),
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("freelancer_profile_id", freelancerProfileId)
      .eq("is_active", true),
    supabase
      .from("experience")
      .select("id", { count: "exact", head: true })
      .eq("freelancer_profile_id", freelancerProfileId),
    supabase
      .from("freelancer_education")
      .select("id", { count: "exact", head: true })
      .eq("freelancer_profile_id", freelancerProfileId),
  ])

  const firstError = skills.error ?? services.error ?? experience.error ?? education.error
  if (firstError) throw firstError

  return {
    skills: skills.count ?? 0,
    activeServices: services.count ?? 0,
    experience: experience.count ?? 0,
    education: education.count ?? 0,
  }
}

type Props = {
  profile: ProfileRow
  freelancerProfile: FreelancerProfileRow
}

/** Dashboard checklist nudging freelancers toward a full public profile. Hidden at 100%. */
export default function ProfileCompletenessCard({ profile, freelancerProfile }: Props) {
  const { t } = useTranslation()
  const { data: counts } = useQuery({
    queryKey: queryKeys.profileCompleteness(freelancerProfile.id),
    queryFn: () => fetchCompletenessCounts(freelancerProfile.id),
    // Refetch on every dashboard visit so edits made on /profile show up immediately.
    staleTime: 0,
  })

  // Render nothing until counts arrive (or if they fail) rather than flashing a wrong score.
  if (!counts) return null

  const items = profileCompletenessItems(profile, freelancerProfile, counts)
  const percent = profileCompletenessPercent(items)
  if (percent >= 100) return null

  const missing = items.filter((item) => !item.done)
  const doneCount = items.length - missing.length

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-[#1B2B4B]">{t("dashboard.completeness.heading")}</h3>
        <p className="text-sm text-slate-500">
          {t("dashboard.completeness.progress", { done: String(doneCount), total: String(items.length) })}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div
          className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t("dashboard.completeness.heading")}
        >
          <div
            className="h-full rounded-full bg-[#D4A843] transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="min-w-[3rem] text-right text-xl font-bold text-[#1B2B4B]">{percent}%</span>
      </div>

      <p className="mt-3 text-sm text-slate-600">{t("dashboard.completeness.hint")}</p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {missing.map((item) => (
          <li key={item.id}>
            <Link
              to={item.href}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm transition hover:border-[#D4A843] hover:bg-amber-50"
            >
              <span className="text-slate-700">
                {t(`dashboard.completeness.items.${item.id}`, {
                  minBio: String(MIN_BIO_LENGTH),
                  minSkills: String(MIN_SKILLS),
                })}
              </span>
              <span className="shrink-0 font-semibold text-[#1B2B4B]">+{item.weight}%</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
