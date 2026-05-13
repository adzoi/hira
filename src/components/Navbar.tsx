import type { MouseEvent } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import type { Json } from "../lib/database.types"
import {
  fetchNotifications,
  markAllAsRead,
  markAsRead,
  subscribeToNotifications,
  type AppNotification,
} from "../lib/notifications.ts"
import { avatarImageUrl } from "../lib/storageImageUrl.ts"
import { supabase } from "../lib/supabase"

const navLinks = [
  { label: "მთავარი", to: "/" },
  { label: "ფრილანსერები", to: "/browse" },
  { label: "ლისტინგები", to: "/listings" },
  { label: "სამუშაოები", to: "/jobs" },
  { label: "დამქირავებლები", to: "/hirers" },
]

function navLinkUnderlineActive(pathname: string, to: string) {
  if (to === "/hirers") return pathname === "/hirers" || pathname.startsWith("/hirer/")
  if (to === "/listings") return pathname === "/listings"
  return pathname === to
}

type JobApplicationPayload = {
  job_application_id?: string
  job_id?: string
  job_title?: string
  freelancer_slug?: string
  freelancer_name?: string
  cover_note?: string | null
  average_rating?: number
  completed_jobs_count?: number
}

function parseJobApplicationPayload(payload: Json | null | undefined): JobApplicationPayload | null {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) return null
  const o = payload as Record<string, unknown>
  const slug = typeof o.freelancer_slug === "string" ? o.freelancer_slug.trim() : ""
  const appId = typeof o.job_application_id === "string" ? o.job_application_id : undefined
  if (!slug && !appId) return null
  return {
    job_application_id: appId,
    job_id: typeof o.job_id === "string" ? o.job_id : undefined,
    job_title: typeof o.job_title === "string" ? o.job_title : undefined,
    freelancer_slug: slug || undefined,
    freelancer_name: typeof o.freelancer_name === "string" ? o.freelancer_name : undefined,
    cover_note: typeof o.cover_note === "string" ? o.cover_note : o.cover_note === null ? null : undefined,
    average_rating: typeof o.average_rating === "number" ? o.average_rating : undefined,
    completed_jobs_count: typeof o.completed_jobs_count === "number" ? o.completed_jobs_count : undefined,
  }
}

/** Matches JobDetail application note format: comment then blank line then „შემოთავაზებული ტარიფი…“. */
function splitCoverNoteAndRate(coverNote: string | null | undefined): { comment: string; rateLine: string | null } {
  const raw = coverNote?.trim() ?? ""
  if (!raw) return { comment: "", rateLine: null }
  if (raw.startsWith("შემოთავაზებული ტარიფი")) {
    return { comment: "", rateLine: raw }
  }
  const sep = "\n\n"
  const idx = raw.indexOf(sep)
  if (idx === -1) return { comment: raw, rateLine: null }
  const comment = raw.slice(0, idx).trim()
  const tail = raw.slice(idx + sep.length).trim()
  if (tail.startsWith("შემოთავაზებული ტარიფი")) {
    return { comment: comment || "", rateLine: tail }
  }
  return { comment: raw, rateLine: null }
}

function formatNotificationRelativeTime(iso: string): string {
  const now = Date.now()
  const diffMs = now - new Date(iso).getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return "ახლახან"
  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))} წუთის წინ`
  if (diffMs < day) return `${Math.max(1, Math.floor(diffMs / hour))} საათის წინ`
  if (diffMs < 7 * day) return `${Math.max(1, Math.floor(diffMs / day))} დღის წინ`
  return new Date(iso).toLocaleDateString("ka-GE")
}

function truncateNotificationBody(text: string | null, max = 60): string | null {
  if (!text) return null
  const t = text.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [isAuthed, setIsAuthed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false) // avatar dropdown
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [fullName, setFullName] = useState("")
  const [userId, setUserId] = useState<string | null>(null)
  const [publicProfileHref, setPublicProfileHref] = useState<string | null>(null)
  const [userType, setUserType] = useState<"freelancer" | "hirer" | null>(null)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [detailNotification, setDetailNotification] = useState<AppNotification | null>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications])

  const postListingOrJob = useMemo(() => {
    if (userType === "freelancer") {
      const listingComposer =
        location.pathname === "/listing/new" ||
        (location.pathname.startsWith("/listing/") && !location.pathname.startsWith("/listings"))
      return {
        to: "/listing/new",
        ariaLabel: "ლისტინგის განთავსება",
        active: listingComposer,
      } as const
    }
    if (userType === "hirer") {
      return {
        to: "/post-job",
        ariaLabel: "სამუშაოს განთავსება",
        active: location.pathname.startsWith("/post-job"),
      } as const
    }
    return {
      to: "/onboarding",
      ariaLabel: "პროფილის შევსება",
      active: location.pathname.startsWith("/onboarding"),
    } as const
  }, [userType, location.pathname])

  const navbarAvatarSrc = useMemo(() => {
    if (!avatarUrl) return null
    return avatarImageUrl(supabase, avatarUrl) ?? avatarUrl
  }, [avatarUrl])

  useEffect(() => {
    const client = supabase
    if (!client) return
    const refresh = async () => {
      const {
        data: { session },
      } = await client.auth.getSession()
      const authed = Boolean(session?.user)
      const uid = session?.user?.id ?? null
      setIsAuthed(authed)
      setUserId(uid)
      if (!authed || !uid) {
        setAvatarUrl(null)
        setFullName("")
        setPublicProfileHref(null)
        setUserType(null)
        setNotifications([])
        setNotificationsOpen(false)
        return
      }
      const [{ data }, list] = await Promise.all([
        client.from("profiles").select("avatar_url, full_name, user_type").eq("id", uid).maybeSingle(),
        fetchNotifications(client),
      ])
      setAvatarUrl(data?.avatar_url ?? null)
      setFullName(data?.full_name ?? "")
      const ut = data?.user_type
      const normalizedType = ut === "freelancer" || ut === "hirer" ? ut : null
      setUserType(normalizedType)
      if (normalizedType === "freelancer") {
        const { data: fp } = await client.from("freelancer_profiles").select("slug").eq("user_id", uid).maybeSingle()
        const slug = fp?.slug?.trim()
        setPublicProfileHref(slug ? `/freelancer/${encodeURIComponent(slug)}` : null)
      } else if (normalizedType === "hirer") {
        const { data: hp } = await client.from("hirer_profiles").select("id").eq("user_id", uid).maybeSingle()
        const id = hp?.id?.trim()
        setPublicProfileHref(id ? `/hirer/${encodeURIComponent(id)}` : null)
      } else {
        setPublicProfileHref(null)
      }
      setNotifications(list)
    }

    refresh()
    const { data: listener } = client.auth.onAuthStateChange(() => {
      refresh()
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client || !userId || !isAuthed) return
    void fetchNotifications(client).then(setNotifications)
  }, [location.pathname, userId, isAuthed])

  useEffect(() => {
    const client = supabase
    if (!client || !userId || !isAuthed) return
    const channel = subscribeToNotifications(client, userId, (n) => {
      setNotifications((prev) => {
        const next = [n, ...prev.filter((x) => x.id !== n.id)]
        return next.slice(0, 30)
      })
    })
    return () => {
      client.removeChannel(channel)
    }
  }, [userId, isAuthed])

  const initials = useMemo(() => {
    const parts = fullName.trim().split(" ").filter(Boolean)
    if (parts.length === 0) return "გ"
    return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
  }, [fullName])

  useEffect(() => {
    if (!notificationsOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const el = notificationsRef.current
      if (el && !el.contains(event.target as Node)) {
        setNotificationsOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [notificationsOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (detailNotification) {
        setDetailNotification(null)
        return
      }
      if (notificationsOpen) setNotificationsOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [detailNotification, notificationsOpen])

  const markNotificationRead = async (row: AppNotification) => {
    if (!supabase || row.is_read) return
    try {
      await markAsRead(supabase, row.id)
      setNotifications((prev) => prev.map((n) => (n.id === row.id ? { ...n, is_read: true } : n)))
    } catch {
      /* ignore */
    }
  }

  const handleMarkAllNotificationsRead = async () => {
    if (!supabase) return
    try {
      await markAllAsRead(supabase)
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    } catch {
      /* ignore */
    }
  }

  const navigateFromNotification = async (row: AppNotification) => {
    await markNotificationRead(row)
    setNotificationsOpen(false)
    setMobileMenuOpen(false)
    const href = row.link?.trim()
    if (!href) return
    if (href.startsWith("http://") || href.startsWith("https://")) {
      window.open(href, "_blank", "noopener,noreferrer")
      return
    }
    navigate(href.startsWith("/") ? href : `/${href}`)
  }

  const openJobApplicationDetail = async (row: AppNotification) => {
    await markNotificationRead(row)
    setDetailNotification(row)
    setNotificationsOpen(false)
    setMobileMenuOpen(false)
  }

  const handleNotificationActivate = async (row: AppNotification) => {
    if (row.type === "job_application") {
      const parsed = parseJobApplicationPayload(row.payload)
      if (parsed && (parsed.freelancer_slug || parsed.job_application_id)) {
        await openJobApplicationDetail(row)
        return
      }
    }
    await navigateFromNotification(row)
  }

  const deleteNotification = async (id: string, event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault()
    event?.stopPropagation()
    if (!supabase || !userId) return
    const { error } = await supabase.from("notifications").delete().eq("id", id).eq("user_id", userId)
    if (error) return
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    setDetailNotification((prev) => (prev?.id === id ? null : prev))
  }

  const detailPayload =
    detailNotification?.type === "job_application"
      ? parseJobApplicationPayload(detailNotification.payload)
      : null
  const detailNoteParts =
    detailPayload != null ? splitCoverNoteAndRate(detailPayload.cover_note ?? null) : { comment: "", rateLine: null as string | null }

  const handlePostJob = async () => {
    if (!supabase) {
      navigate("/login?reason=post-job")
      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      navigate("/login?reason=post-job")
      return
    }

    navigate("/post-job")
  }

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 50)
    onScroll()
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const userDisplayName = fullName.trim() || "მომხმარებელი"

  const confirmAndLogout = () => {
    if (!window.confirm("დარწმუნებული ხარ, რომ გსურს სისტემიდან გასვლა?")) return
    setMenuOpen(false)
    setMobileMenuOpen(false)
    void (async () => {
      const client = supabase
      if (client) await client.auth.signOut()
      navigate("/", { replace: true })
    })()
  }

  return (
    <>
    <header className={`sticky top-0 z-40 border-b border-slate-200 bg-white font-sans ${isScrolled ? "shadow-sm" : ""}`}>
      <div className="mx-auto flex w-full max-w-none items-center justify-between pl-20 pr-6 py-3 md:pr-8">
        <Link to="/" className="inline-flex items-center" aria-label="მთავარი">
          <img src="/images/logo.png" alt="გიგორი" className="h-[52px] w-auto object-contain" />
        </Link>

        <nav className="hidden flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm font-medium md:flex lg:gap-x-4">
          {navLinks.map((link) => (
            <div key={link.label} className="whitespace-nowrap">
              <Link
                to={link.to}
                className={`inline-flex h-10 items-center rounded-full border px-4 transition ${
                  navLinkUnderlineActive(location.pathname, link.to)
                    ? "border-transparent bg-[#0088FF] text-white"
                    : "border-slate-300 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-700"
                }`}
              >
                {link.label}
              </Link>
            </div>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-3 md:flex">
          {isAuthed ? (
            <>
              <Link
                to="/dashboard"
                className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium transition ${
                  location.pathname.startsWith("/dashboard")
                    ? "border-transparent bg-[#0088FF] text-white"
                    : "border-[#B3DEFF] bg-[#E8F4FF] text-[#0088FF] hover:border-[#80C8FF] hover:bg-[#D4EEFF]"
                }`}
              >
                დაშბორდი
              </Link>
              <Link
                to={postListingOrJob.to}
                aria-label={postListingOrJob.ariaLabel}
                title={postListingOrJob.ariaLabel}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border transition ${
                  postListingOrJob.active
                    ? "border-transparent bg-[#0088FF] text-white"
                    : "border-[#B3DEFF] bg-[#E8F4FF] text-[#0088FF] hover:border-[#80C8FF] hover:bg-[#D4EEFF]"
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-[1.125rem] w-[1.125rem] shrink-0">
                  <path stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" d="M12 5v14M5 12h14" />
                </svg>
              </Link>
            </>
          ) : null}

          {isAuthed ? (
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                aria-expanded={notificationsOpen}
                aria-haspopup="menu"
                onClick={() =>
                  setNotificationsOpen((v) => {
                    const opening = !v
                    if (opening && supabase) {
                      void fetchNotifications(supabase).then(setNotifications)
                    }
                    return opening
                  })
                }
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
              >
                <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0m6 0H9" />
                </svg>
                {unreadCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </button>

              {notificationsOpen ? (
                <div
                  role="menu"
                  className="fixed left-4 right-4 top-[72px] z-50 max-h-[min(70vh,420px)] overflow-hidden rounded-2xl border border-slate-200 bg-white text-[#1B2B4B] shadow-xl md:absolute md:right-0 md:left-auto md:top-full md:mt-2 md:w-[min(100vw-2rem,22rem)]"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#1B2B4B]">შეტყობინებები</p>
                      <p className="text-xs text-slate-500">
                        {notifications.length === 0 ? "ცარიელია" : `${Math.min(10, notifications.length)} ბოლო შეტყობინება`}
                      </p>
                    </div>
                    {notifications.some((n) => !n.is_read) ? (
                      <button
                        type="button"
                        onClick={() => void handleMarkAllNotificationsRead()}
                        className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-[#1B2B4B] underline-offset-2 hover:bg-slate-50 hover:underline"
                      >
                        ყველა წაკითხულია
                      </button>
                    ) : null}
                  </div>
                  <div className="max-h-[min(52vh,340px)] overflow-y-auto overscroll-contain">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-slate-600">ახალი შეტყობინებები არ გაქვთ.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {notifications.slice(0, 10).map((n) => (
                          <li key={n.id} className="flex items-stretch gap-0">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void handleNotificationActivate(n)}
                              className={`flex min-w-0 flex-1 flex-col gap-0.5 border-l-4 py-3 pl-3 pr-2 text-left transition hover:bg-slate-50 ${
                                n.is_read ? "border-transparent opacity-90" : "border-[#D4A843] bg-amber-50/40"
                              }`}
                            >
                              <span className={`text-sm ${n.is_read ? "font-medium text-[#1B2B4B]/90" : "font-bold text-[#1B2B4B]"}`}>{n.title}</span>
                              {n.body ? (
                                <span className="text-xs text-slate-600">{truncateNotificationBody(n.body)}</span>
                              ) : null}
                              <span className="text-[11px] text-slate-400">{formatNotificationRelativeTime(n.created_at)}</span>
                            </button>
                            <button
                              type="button"
                              aria-label="შეტყობინების წაშლა"
                              onClick={(event) => void deleteNotification(n.id, event)}
                              className="shrink-0 border-l border-slate-100 px-3 py-3 text-sm text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {isAuthed ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-1.5 pr-2.5 transition hover:border-slate-400"
              >
                <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-bold text-[#1B2B4B]">
                  {avatarUrl ? (
                    <img src={navbarAvatarSrc ?? avatarUrl} alt="მომხმარებლის ავატარი" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </span>
                <span className="max-w-24 truncate text-sm font-medium text-slate-600">{userDisplayName}</span>
              </button>
              <div
                className={`absolute right-0 top-12 w-48 origin-top-right rounded-lg border border-slate-200 bg-white p-2 shadow-lg transition ${
                  menuOpen ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
                }`}
              >
                <Link to="/settings" onClick={() => setMenuOpen(false)} className="block rounded px-3 py-2 text-sm hover:bg-slate-50">
                  პარამეტრები
                </Link>
                <Link to="/saved" onClick={() => setMenuOpen(false)} className="block rounded px-3 py-2 text-sm hover:bg-slate-50">
                  შენახული
                </Link>
                {publicProfileHref ? (
                  <Link to={publicProfileHref} onClick={() => setMenuOpen(false)} className="block rounded px-3 py-2 text-sm hover:bg-slate-50">
                    პროფილი
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={confirmAndLogout}
                  className="mt-1 block w-full rounded border-t border-slate-100 px-3 py-2 pt-3 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  გასვლა
                </button>
              </div>
            </div>
          ) : (
            <>
            <Link
              to="/login"
              className="inline-flex h-11 items-center text-sm font-semibold text-[#1B2B4B] transition hover:text-[#D4A843]"
            >
              შესვლა
            </Link>
            <Link
              to="/register"
              className="inline-flex h-11 items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-[#1B2B4B] transition hover:border-[#D4A843] hover:text-[#D4A843]"
            >
              რეგისტრაცია
            </Link>
            <Link
              to="#"
              onClick={(event) => {
                event.preventDefault()
                handlePostJob()
              }}
              className="inline-flex h-11 items-center rounded-md bg-[#0088FF] px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#006ACC]"
            >
              სამუშაოს განთავსება
            </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white md:hidden"
        >
          <span className="text-lg">{mobileMenuOpen ? "✕" : "☰"}</span>
        </button>
      </div>

      <div
        className={`overflow-hidden border-t border-slate-100 bg-white transition-all md:hidden ${
          mobileMenuOpen ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="mx-auto flex max-w-[1200px] flex-col gap-1 px-4 py-3">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              to={link.to}
              onClick={() => setMobileMenuOpen(false)}
              className={`rounded-md px-3 py-3 text-sm font-semibold ${
                navLinkUnderlineActive(location.pathname, link.to) ? "bg-amber-50 text-[#1B2B4B]" : "text-[#1B2B4B]"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {isAuthed ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false)
                  setNotificationsOpen((v) => !v)
                }}
                className="flex items-center justify-between rounded-md px-3 py-3 text-sm font-semibold text-[#1B2B4B]"
              >
                <span>შეტყობინებები</span>
                {unreadCount > 0 ? (
                  <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>
                ) : null}
              </button>
              <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)} className="rounded-md px-3 py-3 text-sm font-semibold text-[#1B2B4B]">
                დაშბორდი
              </Link>
              <Link
                to={postListingOrJob.to}
                aria-label={postListingOrJob.ariaLabel}
                title={postListingOrJob.ariaLabel}
                onClick={() => setMobileMenuOpen(false)}
                className={`grid place-items-center rounded-md px-3 py-3 ${
                  postListingOrJob.active ? "bg-amber-50 text-[#1B2B4B]" : "text-[#1B2B4B]"
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-6 w-6 shrink-0">
                  <path stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M12 5v14M5 12h14" />
                </svg>
              </Link>
              <Link to="/settings" onClick={() => setMobileMenuOpen(false)} className="rounded-md px-3 py-3 text-sm font-semibold text-[#1B2B4B]">
                პარამეტრები
              </Link>
              {publicProfileHref ? (
                <Link to={publicProfileHref} onClick={() => setMobileMenuOpen(false)} className="rounded-md px-3 py-3 text-sm font-semibold text-[#1B2B4B]">
                  პროფილი
                </Link>
              ) : null}
              <button
                type="button"
                onClick={confirmAndLogout}
                className="rounded-md px-3 py-3 text-left text-sm font-semibold text-red-600"
              >
                გასვლა
              </button>
            </>
          ) : (
            <div className="grid gap-2 pt-2">
              <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 text-sm font-semibold text-[#1B2B4B]">
                შესვლა
              </Link>
              <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="inline-flex h-11 items-center justify-center rounded-md bg-[#1B2B4B] text-sm font-semibold text-white">
                რეგისტრაცია
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false)
                  handlePostJob()
                }}
                className="inline-flex h-11 items-center justify-center rounded-md bg-[#0088FF] text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#006ACC]"
              >
                სამუშაოს განთავსება
              </button>
            </div>
          )}
        </div>
      </div>
    </header>

    {detailNotification && detailPayload ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-detail-title"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) setDetailNotification(null)
        }}
      >
        <div className="max-h-[min(85vh,560px)] w-full min-w-0 max-w-md overflow-x-hidden overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 id="notification-detail-title" className="text-lg font-bold text-[#1B2B4B]">
              {detailNotification.title}
            </h2>
            {detailPayload.job_title || detailPayload.freelancer_name ? (
              <p className="mt-1 text-xs text-slate-500">
                {[detailPayload.job_title ? `სამუშაო: „${detailPayload.job_title}“` : null, detailPayload.freelancer_name ?? null]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
            ) : null}
          </div>

          <div className="min-w-0 space-y-4 px-5 py-4">
            <div className="flex flex-wrap gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <div>
                <p className="text-xs text-slate-500">რეიტინგი</p>
                <p className="font-semibold text-[#1B2B4B]">
                  {(detailPayload.average_rating ?? 0).toFixed(1)} ★
                </p>
              </div>
            </div>

            {detailNoteParts.rateLine ? (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">შემოთავაზებული ტარიფი</p>
                <p className="min-w-0 max-w-full break-words rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#1B2B4B]">
                  {detailNoteParts.rateLine}
                </p>
              </div>
            ) : null}

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">კომენტარი</p>
              <p className="min-h-[3rem] min-w-0 max-w-full whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 [overflow-wrap:anywhere]">
                {detailNoteParts.comment.trim() ? detailNoteParts.comment : "—"}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {detailPayload.freelancer_slug ? (
                <Link
                  to={`/freelancer/${encodeURIComponent(detailPayload.freelancer_slug)}`}
                  onClick={() => setDetailNotification(null)}
                  className="inline-flex flex-1 items-center justify-center rounded-lg bg-[#1B2B4B] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B]"
                >
                  პროფილის ნახვა
                </Link>
              ) : null}
              {detailPayload.job_id ? (
                <button
                  type="button"
                  onClick={() => {
                    setDetailNotification(null)
                    navigate(`/job/${detailPayload.job_id}`)
                  }}
                  className="inline-flex flex-1 items-center justify-center rounded-lg border border-[#1B2B4B] px-4 py-2.5 text-sm font-semibold text-[#1B2B4B] transition hover:bg-slate-50"
                >
                  განცხადების გვერდი
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void deleteNotification(detailNotification.id)}
                className="inline-flex flex-1 items-center justify-center rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
              >
                წაშლა
              </button>
            </div>

            <button
              type="button"
              onClick={() => setDetailNotification(null)}
              className="w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              დახურვა
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  )
}
