import { useCallback, useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { fetchSavedState, toggleSavedItem, type SavedResourceType } from "../lib/savedItems.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase.ts"

type SaveBookmarkButtonProps = {
  resourceType: SavedResourceType
  resourceId: string
  /** Tailwind width / layout under avatar (e.g. w-[88px]); ignored when variant is "icon" unless passed for min size */
  className?: string
  /** "default" = icon + label; "icon" = compact square for use beside primary links */
  variant?: "default" | "icon"
}

function BookmarkSvg({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      <path
        d="M6 2h12v20l-6-4-6 4V2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  )
}

export default function SaveBookmarkButton({
  resourceType,
  resourceId,
  className,
  variant = "default",
}: SaveBookmarkButtonProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [userId, setUserId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !resourceId) {
      setChecked(true)
      return
    }
    let cancelled = false
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const uid = session?.user?.id ?? null
      if (cancelled) return
      setUserId(uid)
      if (!uid) {
        setSaved(false)
        setChecked(true)
        return
      }
      const isSaved = await fetchSavedState(supabase, uid, resourceType, resourceId)
      if (!cancelled) {
        setSaved(isSaved)
        setChecked(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [resourceType, resourceId])

  const onClick = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return
    if (!userId) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
      return
    }
    if (!resourceId || busy) return
    setBusy(true)
    try {
      const { saved: next, error } = await toggleSavedItem(supabase, userId, resourceType, resourceId)
      if (error) {
        if (import.meta.env.DEV) console.warn("[SaveBookmarkButton]", error)
        return
      }
      setSaved(next)
    } finally {
      setBusy(false)
    }
  }, [userId, resourceId, resourceType, busy, navigate, location.pathname, location.search])

  if (!resourceId || !checked) {
    if (variant === "icon") {
      return (
        <div
          className={`h-11 w-11 shrink-0 animate-pulse rounded-lg bg-slate-100 ${className ?? ""}`}
          aria-hidden
        />
      )
    }
    return (
      <div className={`h-9 animate-pulse rounded-lg bg-slate-100 ${className ?? "w-full"}`} aria-hidden />
    )
  }

  const label = saved ? "შენახულია — ამოღება" : "შენახვა"

  if (variant === "icon") {
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={() => void onClick()}
        disabled={busy}
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition disabled:opacity-50 ${
          saved
            ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
            : "border-slate-300 bg-white text-[#1B2B4B] hover:border-[#D4A843] hover:text-[#1B2B4B]"
        } ${className ?? ""}`}
      >
        <BookmarkSvg filled={saved} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
        saved
          ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
          : "border-slate-300 bg-white text-[#1B2B4B] hover:border-[#D4A843] hover:text-[#1B2B4B]"
      } ${className ?? "w-full"}`}
    >
      <BookmarkSvg filled={saved} />
      {saved ? "შენახულია" : "შენახვა"}
    </button>
  )
}
