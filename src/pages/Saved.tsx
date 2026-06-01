import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Navbar from "../components/Navbar.tsx"
import { fetchSavedItems, type SavedListEntry } from "../lib/queries/fetchSavedItems.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase.ts"
import type { SavedResourceType } from "../lib/savedItems.ts"

const typeLabel: Record<SavedResourceType, string> = {
  freelancer: "ფრილანსერი",
  hirer: "დამქირავებელი",
  job: "სამუშაო",
  service: "სერვისი",
}

export default function SavedPage() {
  const queryClient = useQueryClient()
  const [removingId, setRemovingId] = useState<string | null>(null)
  const {
    data: items = [],
    isLoading: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.savedItems("self"),
    queryFn: fetchSavedItems,
    enabled: isSupabaseConfigured,
  })
  const error = isError ? queryErrorMessage(queryError, "ჩატვირთვა ვერ მოხერხდა.") : ""

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
      const { error: deleteError } = await supabase.from("user_saved_items").delete().eq("id", bookmarkId)
      if (deleteError) throw deleteError
      queryClient.setQueryData<SavedListEntry[]>(queryKeys.savedItems("self"), (prev) =>
        (prev ?? []).filter((x) => x.bookmarkId !== bookmarkId),
      )
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
