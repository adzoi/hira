import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase.ts"
import type { SavedResourceType } from "../lib/savedItems.ts"

type BookmarkRow = {
  id: string
  resource_type: string
  resource_id: string
  created_at: string
}

type SavedListEntry = {
  bookmarkId: string
  resourceType: SavedResourceType
  resourceId: string
  createdAt: string
  title: string
  href: string | null
}

const typeLabel: Record<SavedResourceType, string> = {
  freelancer: "ფრილანსერი",
  hirer: "დამქირავებელი",
  job: "სამუშაო",
  service: "სერვისი",
}

function isSavedType(t: string): t is SavedResourceType {
  return t === "freelancer" || t === "hirer" || t === "job" || t === "service"
}

export default function SavedPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [items, setItems] = useState<SavedListEntry[]>([])
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase არ არის კონფიგურირებული.")
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError("")
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) {
        setItems([])
        setLoading(false)
        return
      }

      const { data: bookmarks, error: bErr } = await supabase
        .from("user_saved_items")
        .select("id, resource_type, resource_id, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
      if (bErr) throw bErr

      const rows = (bookmarks ?? []) as BookmarkRow[]
      const fpIds = rows.filter((r) => r.resource_type === "freelancer").map((r) => r.resource_id)
      const hpIds = rows.filter((r) => r.resource_type === "hirer").map((r) => r.resource_id)
      const jobIds = rows.filter((r) => r.resource_type === "job").map((r) => r.resource_id)
      const svcIds = rows.filter((r) => r.resource_type === "service").map((r) => r.resource_id)

      const [fpRes, hpRes, jobRes, svcRes] = await Promise.all([
        fpIds.length
          ? supabase
              .from("freelancer_profiles")
              .select("id, slug, professional_title, profiles:profiles!freelancer_profiles_user_id_fkey(full_name)")
              .in("id", fpIds)
          : Promise.resolve({ data: [] as unknown[], error: null }),
        hpIds.length
          ? supabase.from("hirer_profiles").select("id, company_name").in("id", hpIds)
          : Promise.resolve({ data: [] as unknown[], error: null }),
        jobIds.length ? supabase.from("jobs").select("id, title").in("id", jobIds) : Promise.resolve({ data: [] as unknown[], error: null }),
        svcIds.length ? supabase.from("services").select("id, title").in("id", svcIds) : Promise.resolve({ data: [] as unknown[], error: null }),
      ])

      if (fpRes.error) throw fpRes.error
      if (hpRes.error) throw hpRes.error
      if (jobRes.error) throw jobRes.error
      if (svcRes.error) throw svcRes.error

      const fpMap = new Map<string, { slug: string; title: string }>()
      for (const r of (fpRes.data ?? []) as Array<{
        id: string
        slug: string | null
        professional_title: string | null
        profiles: { full_name: string | null } | { full_name: string | null }[] | null
      }>) {
        const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
        const name = prof?.full_name?.trim() || "ფრილანსერი"
        const slug = r.slug?.trim()
        fpMap.set(r.id, {
          slug: slug ?? "",
          title: name,
        })
      }

      const hpMap = new Map<string, string>()
      for (const r of (hpRes.data ?? []) as Array<{ id: string; company_name: string | null }>) {
        hpMap.set(r.id, r.company_name?.trim() || "დამქირავებელი")
      }

      const jobMap = new Map<string, string>()
      for (const r of (jobRes.data ?? []) as Array<{ id: string; title: string | null }>) {
        jobMap.set(r.id, r.title?.trim() || "სამუშაო")
      }

      const svcMap = new Map<string, string>()
      for (const r of (svcRes.data ?? []) as Array<{ id: string; title: string | null }>) {
        svcMap.set(r.id, r.title?.trim() || "სერვისი")
      }

      const merged: SavedListEntry[] = []
      for (const row of rows) {
        if (!isSavedType(row.resource_type)) continue
        const rt = row.resource_type
        let title = "…"
        let href: string | null = null

        if (rt === "freelancer") {
          const m = fpMap.get(row.resource_id)
          if (m?.slug) {
            title = m.title
            href = `/freelancer/${encodeURIComponent(m.slug)}`
          } else {
            title = "ფრილანსერი (არ ჩანს)"
          }
        } else if (rt === "hirer") {
          const name = hpMap.get(row.resource_id)
          if (name) {
            title = name
            href = `/hirer/${encodeURIComponent(row.resource_id)}`
          } else {
            title = "დამქირავებელი (არ ჩანს)"
          }
        } else if (rt === "job") {
          const t = jobMap.get(row.resource_id)
          if (t) {
            title = t
            href = `/job/${encodeURIComponent(row.resource_id)}`
          } else {
            title = "სამუშაო (არ ჩანს)"
          }
        } else if (rt === "service") {
          const t = svcMap.get(row.resource_id)
          if (t) {
            title = t
            href = `/listing/${encodeURIComponent(row.resource_id)}`
          } else {
            title = "სერვისი (არ ჩანს)"
          }
        }

        merged.push({
          bookmarkId: row.id,
          resourceType: rt,
          resourceId: row.resource_id,
          createdAt: row.created_at,
          title,
          href,
        })
      }

      setItems(merged)
    } catch (e) {
      setError(e instanceof Error ? e.message : "ჩატვირთვა ვერ მოხერხდა.")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    document.title = "შენახული — გიგორი"
    return () => {
      document.title = "გიგორი"
    }
  }, [])

  const remove = async (bookmarkId: string) => {
    if (!supabase || removingId) return
    setRemovingId(bookmarkId)
    try {
      const { error } = await supabase.from("user_saved_items").delete().eq("id", bookmarkId)
      if (error) throw error
      setItems((prev) => prev.filter((x) => x.bookmarkId !== bookmarkId))
    } catch {
      /* ignore */
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC]">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-10">
        <h1 className="text-2xl font-extrabold text-[#1B2B4B]">შენახული</h1>
        <p className="mt-1 text-sm text-slate-600">ფრილანსერები, დამქირავებლები, სამუშაოები და სერვისები, რომლებიც შენ გინდა მოგვიანებით გადახედო.</p>

        {loading ? (
          <p className="mt-8 text-sm text-slate-500">იტვირთება…</p>
        ) : error ? (
          <p className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : items.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-600">
            ჯერ არაფერი გაქვს შენახული. გადახედე{" "}
            <Link to="/browse" className="font-semibold text-[#0088FF] underline">
              ფრილანსერებს
            </Link>
            ,{" "}
            <Link to="/listings" className="font-semibold text-[#0088FF] underline">
              ლისტინგებს
            </Link>{" "}
            ან{" "}
            <Link to="/jobs" className="font-semibold text-[#0088FF] underline">
              სამუშაოებს
            </Link>{" "}
            და დააჭირე „შენახვა“ პროფილის ფოტოს ქვეშ.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {items.map((entry) => (
              <li
                key={entry.bookmarkId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    {typeLabel[entry.resourceType]}
                  </span>
                  {entry.href ? (
                    <Link to={entry.href} className="mt-1 block truncate text-base font-semibold text-[#1B2B4B] hover:text-[#D4A843]">
                      {entry.title}
                    </Link>
                  ) : (
                    <p className="mt-1 truncate text-base font-semibold text-slate-500">{entry.title}</p>
                  )}
                  <p className="mt-0.5 text-xs text-slate-500">
                    {new Date(entry.createdAt).toLocaleString("ka-GE")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {entry.href ? (
                    <Link
                      to={entry.href}
                      className="rounded-lg border border-[#1B2B4B] px-3 py-1.5 text-xs font-semibold text-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white"
                    >
                      გახსნა
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    disabled={removingId === entry.bookmarkId}
                    onClick={() => void remove(entry.bookmarkId)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {removingId === entry.bookmarkId ? "…" : "წაშლა"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
