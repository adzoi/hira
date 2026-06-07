import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import type { FollowListProfile } from "../lib/follows.ts"
import { getFollowers, getFollowing, resolveProfilePublicHrefByIds } from "../lib/follows.ts"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"

export type FollowModalTab = "followers" | "following"

function userTypeBadgeClasses(userType: string) {
  if (userType === "freelancer") return "rounded-md bg-emerald-100 px-1.5 py-0.5 text-emerald-900"
  if (userType === "hirer") return "rounded-md bg-violet-100 px-1.5 py-0.5 text-violet-900"
  return "rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-800"
}

function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

type Props = {
  open: boolean
  onClose: () => void
  /** `profiles.id` of the profile whose followers/following are listed. */
  profileId: string
  /** Which tab opens first. */
  initialTab: FollowModalTab
}

/** Instagram-style plaintext stat row; opens modal via callbacks. */
export function FollowStatPills({
  followerCount,
  followingCount,
  onOpenFollowers,
  onOpenFollowing,
  className = "mt-2",
}: {
  followerCount: number
  followingCount: number
  onOpenFollowers: () => void
  onOpenFollowing: () => void
  /** Extra classes on the wrapping row */
  className?: string
}) {
  const { t, locale } = useTranslation()
  const countLocale = locale === "en" ? "en-US" : "ka-GE"

  return (
    <div className={`flex flex-wrap items-center gap-1 text-sm text-slate-600 ${className}`}>
      <button
        type="button"
        onClick={onOpenFollowers}
        className="border-0 bg-transparent p-0 text-left hover:opacity-80 focus:outline-none focus-visible:underline"
      >
        <span className="font-bold tabular-nums text-gray-900">{followerCount.toLocaleString(countLocale)}</span>
        <span> {t("common.followers")}</span>
      </button>
      <span className="mx-0.5 text-slate-400" aria-hidden>
        ·
      </span>
      <button
        type="button"
        onClick={onOpenFollowing}
        className="border-0 bg-transparent p-0 text-left hover:opacity-80 focus:outline-none focus-visible:underline"
      >
        <span className="font-bold tabular-nums text-gray-900">{followingCount.toLocaleString(countLocale)}</span>
        <span> {t("common.following")}</span>
      </button>
    </div>
  )
}

export default function FollowListsModal({ open, onClose, profileId, initialTab }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<FollowModalTab>(initialTab)
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState("")
  const [followersList, setFollowersList] = useState<FollowListProfile[]>([])
  const [followingList, setFollowingList] = useState<FollowListProfile[]>([])
  const [hrefById, setHrefById] = useState<Record<string, string>>({})

  function userTypeBadgeLabel(userType: string) {
    if (userType === "freelancer") return t("auth.freelancer")
    if (userType === "hirer") return t("auth.hirer")
    return userType
  }

  useEffect(() => {
    if (!open) return
    setTab(initialTab)
  }, [open, initialTab])

  useEffect(() => {
    if (!open || !profileId.trim()) return

    let cancelled = false
    setLoading(true)
    setLoadErr("")
    ;(async () => {
      if (!isSupabaseConfigured || !supabase) {
        if (!cancelled) {
          setLoadErr(t("validation.supabaseMissing"))
          setFollowersList([])
          setFollowingList([])
          setHrefById({})
        }
        return
      }
      try {
        const [followers, following] = await Promise.all([
          getFollowers(profileId),
          getFollowing(profileId),
        ])
        if (cancelled) return
        setFollowersList(followers)
        setFollowingList(following)
        const ids = [...followers.map((p) => p.id), ...following.map((p) => p.id)]
        const hrefMap = await resolveProfilePublicHrefByIds(ids)
        if (!cancelled) setHrefById(hrefMap)
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e instanceof Error ? e.message : t("common.somethingWrong"))
          setFollowersList([])
          setFollowingList([])
          setHrefById({})
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, profileId])

  if (!open) return null

  const rows = tab === "followers" ? followersList : followingList

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="follow-lists-modal-title"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <h2 id="follow-lists-modal-title" className="sr-only">
          {t("follow.modalTitle")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-md border border-slate-300 px-2.5 py-1 text-lg leading-none text-slate-600 hover:bg-slate-50"
          aria-label={t("common.close")}
        >
          ×
        </button>
        <div className="grid shrink-0 grid-cols-2 gap-0 border-b border-slate-100 px-3 pt-12 sm:px-5 sm:pt-4">
          <button
            type="button"
            onClick={() => setTab("followers")}
            className={`border-b-2 py-3 text-sm font-semibold transition ${
              tab === "followers" ? "border-[#D4A843] text-[#1B2B4B]" : "border-transparent text-slate-500 hover:text-[#1B2B4B]"
            }`}
          >
            {t("common.followers")}
          </button>
          <button
            type="button"
            onClick={() => setTab("following")}
            className={`border-b-2 py-3 text-sm font-semibold transition ${
              tab === "following" ? "border-[#D4A843] text-[#1B2B4B]" : "border-transparent text-slate-500 hover:text-[#1B2B4B]"
            }`}
          >
            {t("common.following")}
          </button>
        </div>

        <div className="min-h-[200px] flex-1 overflow-y-auto px-2 py-2">
          {loadErr ? (
            <p className="px-3 py-8 text-center text-sm text-red-600">{loadErr}</p>
          ) : loading ? (
            <ul className="divide-y divide-slate-100 px-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="flex animate-pulse items-center gap-3 py-3">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-slate-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/2 rounded bg-slate-100" />
                    <div className="h-3 w-1/4 rounded bg-slate-100" />
                  </div>
                </li>
              ))}
            </ul>
          ) : rows.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-slate-600">
              {tab === "followers" ? t("follow.noFollowers") : t("follow.notFollowing")}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((person) => {
                const href = hrefById[person.id]
                const name = person.full_name.trim() || t("nav.user")
                return (
                  <li key={person.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-bold text-[#1B2B4B]">
                      {person.avatar_url ? (
                        <img
                          src={avatarImageUrl(supabase, person.avatar_url) ?? person.avatar_url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        initials(name)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#1B2B4B]">{name}</p>
                      <p className="mt-0.5">
                        <span className={`text-[11px] font-medium ${userTypeBadgeClasses(person.user_type)}`}>
                          {userTypeBadgeLabel(person.user_type)}
                        </span>
                      </p>
                    </div>
                    {href ? (
                      <Link
                        to={href}
                        onClick={onClose}
                        className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#1B2B4B] transition hover:border-[#D4A843]"
                      >
                        {t("nav.profile")}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
