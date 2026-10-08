import { useState } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { supabase } from "../lib/supabase"

type Role = "freelancer" | "hirer"

type Props = {
  role: Role
  userId: string
  avatarUrl: string | null
  /** Account creation time: the checklist shows for new accounts only (or right after onboarding). */
  createdAt: string
  freelancerProfileId?: string | null
  freelancerSlug?: string | null
  hirerProfileId?: string | null
  hirerHasCompanyDetails?: boolean
  /** Just finished onboarding (`?welcome=1`): show the celebratory heading. */
  justJoined: boolean
}

type Item = {
  id: string
  done: boolean
  href?: string
  /** Click marks the item done locally (things we can't see server-side, like sharing). */
  onClick?: () => void
}

const NEW_ACCOUNT_DAYS = 30

async function fetchFreelancerCounts(freelancerProfileId: string) {
  if (!supabase) return { skills: 0, services: 0, portfolio: 0, applications: 0 }
  const head = { count: "exact" as const, head: true }
  const [skills, services, portfolio, applications] = await Promise.all([
    supabase.from("freelancer_skills").select("id", head).eq("freelancer_profile_id", freelancerProfileId),
    supabase.from("services").select("id", head).eq("freelancer_profile_id", freelancerProfileId).eq("is_active", true),
    supabase.from("portfolio_items").select("id", head).eq("freelancer_profile_id", freelancerProfileId),
    supabase.from("job_applications").select("id", head).eq("freelancer_profile_id", freelancerProfileId),
  ])
  return {
    skills: skills.count ?? 0,
    services: services.count ?? 0,
    portfolio: portfolio.count ?? 0,
    applications: applications.count ?? 0,
  }
}

async function fetchHirerCounts(userId: string, hirerProfileId: string) {
  if (!supabase) return { jobs: 0, saved: 0, invites: 0 }
  const head = { count: "exact" as const, head: true }
  const [jobs, saved, invites] = await Promise.all([
    supabase.from("jobs").select("id", head).eq("hirer_profile_id", hirerProfileId),
    supabase.from("user_saved_items").select("id", head).eq("user_id", userId).eq("resource_type", "freelancer"),
    supabase.from("job_invitations").select("id", head).eq("hirer_profile_id", hirerProfileId),
  ])
  return { jobs: jobs.count ?? 0, saved: saved.count ?? 0, invites: invites.count ?? 0 }
}

function readFlags(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

/** "You're in - here's what to do next": first-week activation steps for new freelancers and hirers. */
export default function WelcomeChecklist(props: Props) {
  const { role, userId, avatarUrl, createdAt, freelancerProfileId, freelancerSlug, hirerProfileId, hirerHasCompanyDetails, justJoined } = props
  const { t } = useTranslation()
  const flagsKey = `hira.welcome.${userId}`
  const [flags, setFlags] = useState<Record<string, boolean>>(() => readFlags(flagsKey))
  const [copied, setCopied] = useState(false)

  const setFlag = (id: string) => {
    setFlags((prev) => {
      const next = { ...prev, [id]: true }
      try {
        localStorage.setItem(flagsKey, JSON.stringify(next))
      } catch {
        /* storage unavailable: remembered for this visit only */
      }
      return next
    })
  }

  const [now] = useState(() => Date.now())
  const ageDays = (now - Date.parse(createdAt)) / 86_400_000
  const eligible = justJoined || (Number.isFinite(ageDays) && ageDays <= NEW_ACCOUNT_DAYS)
  const visible = eligible && !flags.dismissed

  const { data: fCounts } = useQuery({
    queryKey: ["welcome-checklist", "freelancer", freelancerProfileId],
    queryFn: () => fetchFreelancerCounts(freelancerProfileId!),
    enabled: visible && role === "freelancer" && Boolean(freelancerProfileId),
    staleTime: 0,
  })
  const { data: hCounts } = useQuery({
    queryKey: ["welcome-checklist", "hirer", hirerProfileId],
    queryFn: () => fetchHirerCounts(userId, hirerProfileId!),
    enabled: visible && role === "hirer" && Boolean(hirerProfileId),
    staleTime: 0,
  })

  if (!visible) return null
  if (role === "freelancer" && !fCounts) return null
  if (role === "hirer" && !hCounts) return null

  const profileUrl = freelancerSlug ? `${window.location.origin}/freelancer/${encodeURIComponent(freelancerSlug)}` : ""

  const copyProfileLink = async () => {
    if (!profileUrl) return
    try {
      await navigator.clipboard.writeText(profileUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked: still count it, the link is visible on the profile */
    }
    setFlag("share")
  }

  const items: Item[] =
    role === "freelancer" && fCounts
      ? [
          { id: "created", done: true },
          { id: "avatar", done: Boolean(avatarUrl?.trim()), href: "/profile" },
          { id: "skills", done: fCounts.skills >= 3, href: "/profile" },
          { id: "service", done: fCounts.services > 0, href: "/listing/new?from=profile" },
          { id: "portfolio", done: fCounts.portfolio > 0, href: "/profile" },
          { id: "apply", done: fCounts.applications > 0, href: "/jobs" },
          { id: "share", done: Boolean(flags.share), onClick: () => void copyProfileLink() },
          {
            id: "cv",
            done: Boolean(flags.cv),
            href: freelancerSlug ? `/freelancer/${encodeURIComponent(freelancerSlug)}?cv=1` : "/profile",
            onClick: () => setFlag("cv"),
          },
        ]
      : hCounts
        ? [
            { id: "created", done: true },
            { id: "company", done: Boolean(hirerHasCompanyDetails), href: "/profile" },
            { id: "logo", done: Boolean(avatarUrl?.trim()), href: "/profile" },
            { id: "postJob", done: hCounts.jobs > 0, href: "/post-job" },
            { id: "saveFreelancer", done: hCounts.saved > 0, href: "/freelancers" },
            { id: "invite", done: hCounts.invites > 0, href: "/freelancers" },
          ]
        : []

  const doneCount = items.filter((i) => i.done).length
  const allDone = doneCount === items.length
  const percent = Math.round((doneCount / items.length) * 100)
  const nextItem = items.find((i) => !i.done)

  return (
    <div className="rounded-xl border border-[#0088FF]/25 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-[#1B2B4B]">
            {allDone ? t("welcome.allDoneHeading") : justJoined ? t("welcome.justJoinedHeading") : t("welcome.heading")}
          </h3>
          <p className="mt-1 text-sm text-slate-600">{allDone ? t("welcome.allDoneHint") : t(`welcome.${role}Hint`)}</p>
        </div>
        <button
          type="button"
          onClick={() => setFlag("dismissed")}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          {allDone ? t("welcome.close") : t("welcome.hide")}
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t("welcome.heading")}
        >
          <div className="h-full rounded-full bg-[#0088FF] transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
        <span className="text-sm font-semibold text-[#1B2B4B]">{t("welcome.progress", { done: doneCount, total: items.length })}</span>
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const label = item.id === "share" && copied ? t("welcome.copied") : t(`welcome.items.${role}.${item.id}`)
          const isNext = item === nextItem
          const inner = (
            <>
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  item.done ? "bg-emerald-500 text-white" : isNext ? "border-2 border-[#0088FF] text-[#0088FF]" : "border-2 border-slate-300 text-slate-400"
                }`}
              >
                {item.done ? "✓" : ""}
              </span>
              <span className={`min-w-0 flex-1 ${item.done ? "text-slate-400 line-through" : "font-medium text-[#1B2B4B]"}`}>{label}</span>
              {!item.done && (item.href || item.onClick) ? <span className="shrink-0 text-[#0088FF]">→</span> : null}
              <span className="sr-only">{item.done ? t("welcome.doneSr") : ""}</span>
            </>
          )
          const cls = `flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${
            item.done
              ? "border-slate-100 bg-slate-50"
              : isNext
                ? "border-[#0088FF] bg-[#E8F4FF] hover:bg-[#d6ebff]"
                : "border-slate-200 bg-white hover:border-[#0088FF]"
          }`
          return (
            <li key={item.id}>
              {item.done || (!item.href && !item.onClick) ? (
                <div className={cls}>{inner}</div>
              ) : item.href ? (
                <Link to={item.href} onClick={item.onClick} className={cls}>
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={item.onClick} className={`${cls} w-full text-left`}>
                  {inner}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
