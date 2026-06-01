import { isSupabaseConfigured, supabase } from "../supabase.ts"
import type { SavedResourceType } from "../savedItems.ts"

type BookmarkRow = {
  id: string
  resource_type: string
  resource_id: string
  created_at: string
}

export type SavedListEntry = {
  bookmarkId: string
  resourceType: SavedResourceType
  resourceId: string
  createdAt: string
  title: string
  href: string | null
}

function isSavedType(t: string): t is SavedResourceType {
  return t === "freelancer" || t === "hirer" || t === "job" || t === "service"
}

export async function fetchSavedItems(): Promise<SavedListEntry[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase არ არის კონფიგურირებული.")
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return []

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
    fpMap.set(r.id, { slug: slug ?? "", title: name })
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

  return merged
}
