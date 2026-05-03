import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import SkeletonCard from "../components/ui/SkeletonCard.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type InboxThread = {
  id: string
  createdAt: string
  message: string
  proposedBudget: number | null
  status: string
  completedAt: string | null
  listingTitle: string
  peerName: string
  peerAvatarUrl: string | null
  peerProfileLink: string | null
  peerUserId: string
}

function embedOne<T extends Record<string, unknown>>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] as T | undefined) ?? null : v
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ka-GE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function statusLabel(status: string) {
  switch (status) {
    case "pending":
      return "მოლოდინში"
    case "accepted":
      return "მიღებული"
    case "declined":
      return "უარყოფილი"
    case "in_progress":
      return "მიმდინარე"
    case "completed":
      return "დასრულებული"
    case "cancelled":
      return "გაუქმებული"
    default:
      return status
  }
}

function peerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function formatSupabaseErr(e: unknown): string {
  if (
    e instanceof Error &&
    (e.name === "PostgrestError" || typeof (e as { code?: string }).code === "string")
  ) {
    const pe = e as Error & { details?: string; hint?: string; code?: string }
    const parts = [pe.message, pe.details, pe.hint].filter((p) => typeof p === "string" && p.length > 0)
    const body = parts.join(" — ")
    return pe.code && body ? `${body} (${pe.code})` : body || pe.message || "შენახვა ვერ მოხერხდა."
  }
  if (typeof e === "object" && e !== null && "message" in e) {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const msg = typeof o.message === "string" ? o.message : ""
    const details = typeof o.details === "string" ? o.details : ""
    const hint = typeof o.hint === "string" ? o.hint : ""
    const code = typeof o.code === "string" ? o.code : ""
    const parts = [msg, details, hint].filter(Boolean)
    if (parts.length > 0) return code ? `${parts.join(" — ")} (${code})` : parts.join(" — ")
  }
  if (e instanceof Error) return e.message || "შენახვა ვერ მოხერხდა."
  return "შენახვა ვერ მოხერხდა."
}

export default function MessagesPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [threads, setThreads] = useState<InboxThread[]>([])
  const [inboxKind, setInboxKind] = useState<"freelancer" | "hirer" | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reviewedInquiryIds, setReviewedInquiryIds] = useState<Set<string>>(() => new Set())
  const [reviewModalThread, setReviewModalThread] = useState<InboxThread | null>(null)
  const [reviewStars, setReviewStars] = useState(5)
  const [reviewComment, setReviewComment] = useState("")
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState("")

  useEffect(() => {
    document.title = "ინბოქსი — გიგორი"
  }, [])

  useEffect(() => {
    const load = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setError("Supabase არ არის კონფიგურირებული.")
        setLoading(false)
        return
      }

      setLoading(true)
      setError("")
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          navigate("/login", { replace: true, state: { from: "/messages" } })
          return
        }

        const { data: profile, error: pErr } = await supabase.from("profiles").select("user_type").eq("id", user.id).single()
        if (pErr || !profile) throw new Error("პროფილი ვერ ჩაიტვირთა.")

        async function fetchReviewedInquiryIds(
          client: typeof supabase,
          reviewerId: string,
          inquiryIds: string[],
        ): Promise<Set<string>> {
          if (!client || inquiryIds.length === 0) return new Set()
          const { data, error } = await client
            .from("reviews")
            .select("service_inquiry_id")
            .eq("reviewer_id", reviewerId)
            .in("service_inquiry_id", inquiryIds)
          if (error) {
            console.warn("[messages] inquiry reviews:", error.message)
            return new Set()
          }
          return new Set(
            (data ?? [])
              .map((r) => (r as { service_inquiry_id?: string | null }).service_inquiry_id)
              .filter((id): id is string => typeof id === "string" && id.length > 0),
          )
        }

        if (profile.user_type === "freelancer") {
          const { data: fp, error: fpErr } = await supabase.from("freelancer_profiles").select("id").eq("user_id", user.id).maybeSingle()
          if (fpErr) throw fpErr
          if (!fp?.id) {
            setInboxKind("freelancer")
            setThreads([])
            setReviewedInquiryIds(new Set())
            setLoading(false)
            return
          }

          const { data: rows, error: qErr } = await supabase
            .from("service_inquiries")
            .select(
              `
              id,
              hirer_profile_id,
              created_at,
              message,
              proposed_budget,
              status,
              completed_at,
              services ( title ),
              hirer_profiles (
                company_name,
                profiles:profiles!hirer_profiles_user_id_fkey ( id, full_name, avatar_url )
              )
            `,
            )
            .eq("freelancer_profile_id", fp.id)
            .order("created_at", { ascending: false })
            .limit(80)

          if (qErr) throw qErr

          const mapped: InboxThread[] = (rows ?? []).map((row: Record<string, unknown>) => {
            const svc = embedOne(row.services as Record<string, unknown> | Record<string, unknown>[] | null)
            const hp = embedOne(row.hirer_profiles as Record<string, unknown> | Record<string, unknown>[] | null)
            const prof = embedOne(hp?.profiles as Record<string, unknown> | Record<string, unknown>[] | null)
            const company = typeof hp?.company_name === "string" ? hp.company_name.trim() : ""
            const fullName = typeof prof?.full_name === "string" ? prof.full_name.trim() : ""
            const peerName = company || fullName || "დამქირავებელი"
            const peerAvatarUrl = typeof prof?.avatar_url === "string" && prof.avatar_url ? prof.avatar_url : null
            const hirerProfId = String(row.hirer_profile_id ?? "")
            const peerProfileLink = UUID_RE.test(hirerProfId) ? `/hirer/${hirerProfId}` : null
            const peerIdRaw = typeof prof?.id === "string" ? prof.id.trim() : ""
            const peerUserId = UUID_RE.test(peerIdRaw) ? peerIdRaw : ""

            return {
              id: String(row.id),
              createdAt: String(row.created_at ?? ""),
              message: String(row.message ?? ""),
              proposedBudget: row.proposed_budget != null ? Number(row.proposed_budget) : null,
              status: String(row.status ?? "pending"),
              completedAt: row.completed_at != null ? String(row.completed_at) : null,
              listingTitle: typeof svc?.title === "string" && svc.title.trim() ? svc.title : "ლისტინგი",
              peerName,
              peerAvatarUrl,
              peerProfileLink,
              peerUserId,
            }
          })

          setInboxKind("freelancer")
          setThreads(mapped)
          setReviewedInquiryIds(await fetchReviewedInquiryIds(supabase, user.id, mapped.map((t) => t.id)))
        } else if (profile.user_type === "hirer") {
          const { data: hp, error: hpErr } = await supabase.from("hirer_profiles").select("id").eq("user_id", user.id).maybeSingle()
          if (hpErr) throw hpErr
          if (!hp?.id) {
            setInboxKind("hirer")
            setThreads([])
            setReviewedInquiryIds(new Set())
            setLoading(false)
            return
          }

          const { data: rows, error: qErr } = await supabase
            .from("service_inquiries")
            .select(
              `
              id,
              created_at,
              message,
              proposed_budget,
              status,
              completed_at,
              services ( title ),
              freelancer_profiles (
                slug,
                profiles:profiles!freelancer_profiles_user_id_fkey ( id, full_name, avatar_url )
              )
            `,
            )
            .eq("hirer_profile_id", hp.id)
            .order("created_at", { ascending: false })
            .limit(80)

          if (qErr) throw qErr

          const mapped: InboxThread[] = (rows ?? []).map((row: Record<string, unknown>) => {
            const svc = embedOne(row.services as Record<string, unknown> | Record<string, unknown>[] | null)
            const fp = embedOne(row.freelancer_profiles as Record<string, unknown> | Record<string, unknown>[] | null)
            const prof = embedOne(fp?.profiles as Record<string, unknown> | Record<string, unknown>[] | null)
            const fullName = typeof prof?.full_name === "string" ? prof.full_name.trim() : ""
            const slug = typeof fp?.slug === "string" ? fp.slug.trim() : ""
            const peerName = fullName || "ფრილანსერი"
            const peerAvatarUrl = typeof prof?.avatar_url === "string" && prof.avatar_url ? prof.avatar_url : null
            const peerProfileLink = slug ? `/freelancer/${encodeURIComponent(slug)}` : null
            const peerIdRaw = typeof prof?.id === "string" ? prof.id.trim() : ""
            const peerUserId = UUID_RE.test(peerIdRaw) ? peerIdRaw : ""

            return {
              id: String(row.id),
              createdAt: String(row.created_at ?? ""),
              message: String(row.message ?? ""),
              proposedBudget: row.proposed_budget != null ? Number(row.proposed_budget) : null,
              status: String(row.status ?? "pending"),
              completedAt: row.completed_at != null ? String(row.completed_at) : null,
              listingTitle: typeof svc?.title === "string" && svc.title.trim() ? svc.title : "ლისტინგი",
              peerName,
              peerAvatarUrl,
              peerProfileLink,
              peerUserId,
            }
          })

          setInboxKind("hirer")
          setThreads(mapped)
          setReviewedInquiryIds(await fetchReviewedInquiryIds(supabase, user.id, mapped.map((t) => t.id)))
        } else {
          setError("ინბოქსი ხელმისაწვდომია მხოლოდ ფრილანსერის ან დამქირავებლის ანგარიშით.")
          setInboxKind(null)
          setThreads([])
          setReviewedInquiryIds(new Set())
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "ჩატვირთვა ვერ მოხერხდა.")
        setThreads([])
        setReviewedInquiryIds(new Set())
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [navigate])

  const openInquiryReviewModal = (thread: InboxThread) => {
    setReviewError("")
    setReviewStars(5)
    setReviewComment("")
    setReviewModalThread(thread)
  }

  const submitInquiryReview = async () => {
    if (!isSupabaseConfigured || !supabase || !reviewModalThread) return
    const comment = reviewComment.trim()
    if (comment.length < 10) {
      setReviewError("კომენტარი მინიმუმ 10 სიმბოლო უნდა იყოს.")
      return
    }
    if (reviewStars < 1 || reviewStars > 5) {
      setReviewError("აირჩიე შეფასება 1-დან 5 ვარსკვლაური.")
      return
    }
    if (!reviewModalThread.peerUserId) {
      setReviewError("პარტნიორის მონაცემი ვერ ჩაიტვირთა — განაახლე გვერდი.")
      return
    }
    setReviewSubmitting(true)
    setReviewError("")
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        navigate("/login", { replace: true, state: { from: "/messages" } })
        return
      }
      const nowIso = new Date().toISOString()
      const { data: existing } = await supabase
        .from("reviews")
        .select("id")
        .eq("service_inquiry_id", reviewModalThread.id)
        .eq("reviewer_id", user.id)
        .maybeSingle()
      if (existing) {
        setReviewedInquiryIds((prev) => new Set(prev).add(reviewModalThread.id))
        setReviewModalThread(null)
        return
      }

      const { error: revErr } = await supabase.from("reviews").insert({
        service_inquiry_id: reviewModalThread.id,
        completed_job_id: null,
        reviewer_id: user.id,
        reviewee_id: reviewModalThread.peerUserId,
        rating_overall: reviewStars,
        rating_quality: reviewStars,
        rating_timeliness: reviewStars,
        rating_communication: reviewStars,
        review_text: comment,
        created_at: nowIso,
        updated_at: nowIso,
      })
      if (revErr) throw revErr
      setReviewedInquiryIds((prev) => new Set(prev).add(reviewModalThread.id))
      setReviewModalThread(null)
      setReviewComment("")
    } catch (e) {
      setReviewError(formatSupabaseErr(e))
    } finally {
      setReviewSubmitting(false)
    }
  }

  const selected = selectedId ? threads.find((t) => t.id === selectedId) ?? null : null

  return (
    <div className="min-h-screen bg-[#F8F9FC]">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1B2B4B] md:text-3xl">ინბოქსი</h1>
            <p className="mt-1 text-sm text-slate-600">
              {inboxKind === "freelancer"
                ? "ლისტინგებზე მიღებული შეთავაზებები — დამქირავებლის სახელი და ფოტო."
                : inboxKind === "hirer"
                  ? "გაგზავნილი შეთავაზებები — ფრილანსერის სახელი და ფოტო."
                  : "შეტყობინებები ლისტინგებიდან."}
            </p>
          </div>
          <Link
            to="/dashboard"
            className="text-sm font-semibold text-[#D4A843] underline decoration-[#D4A843]/50 underline-offset-2 hover:text-[#1B2B4B]"
          >
            დაშბორდი →
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : error ? (
          <ErrorState message={error} />
        ) : threads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <p className="text-slate-700">ჯერ შეტყობინებები არ გაქვს.</p>
            <p className="mt-2 text-sm text-slate-500">
              {inboxKind === "hirer" ? (
                <>
                  გაგზავნე შეთავაზება{" "}
                  <Link to="/listings" className="font-semibold text-[#D4A843] hover:underline">
                    ლისტინგებიდან
                  </Link>
                  .
                </>
              ) : (
                "დამქირავებლები ლისტინგებიდან გამოგიგზავნიან შეთავაზებას აქ."
              )}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
            <ul className="space-y-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
                      selectedId === t.id ? "bg-amber-50 ring-1 ring-[#D4A843]/40" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1B2B4B]/10 text-sm font-bold text-[#1B2B4B]">
                      {t.peerAvatarUrl ? (
                        <img src={t.peerAvatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        peerInitials(t.peerName)
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[#1B2B4B]">{t.peerName}</p>
                      <p className="truncate text-xs text-slate-500">{t.listingTitle}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-700 [overflow-wrap:anywhere]">{t.message}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span>{formatDate(t.createdAt)}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-[#1B2B4B]">{statusLabel(t.status)}</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-24 lg:self-start">
              {selected ? (
                <>
                  <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1B2B4B]/10 text-base font-bold text-[#1B2B4B]">
                      {selected.peerAvatarUrl ? (
                        <img src={selected.peerAvatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        peerInitials(selected.peerName)
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-lg font-extrabold text-[#1B2B4B]">{selected.peerName}</p>
                      {selected.peerProfileLink ? (
                        <Link to={selected.peerProfileLink} className="text-sm font-semibold text-[#D4A843] hover:underline">
                          პროფილი →
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-semibold uppercase text-slate-500">ლისტინგი</p>
                  <p className="text-sm font-semibold text-[#1B2B4B]">{selected.listingTitle}</p>
                  {selected.proposedBudget != null ? (
                    <p className="mt-2 text-sm text-slate-700">შემოთავაზებული: {selected.proposedBudget.toLocaleString("ka-GE")} ₾</p>
                  ) : null}
                  <p className="mt-3 text-xs font-semibold uppercase text-slate-500">სტატუსი</p>
                  <p className="text-sm font-semibold text-[#1B2B4B]">{statusLabel(selected.status)}</p>
                  {selected.status === "completed" ? (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      {reviewedInquiryIds.has(selected.id) ? (
                        <p className="text-sm font-semibold text-emerald-700">შეფასება გაგზავნილია.</p>
                      ) : selected.peerUserId ? (
                        <button
                          type="button"
                          onClick={() => openInquiryReviewModal(selected)}
                          className="rounded-lg border border-[#D4A843] bg-amber-50 px-4 py-2 text-sm font-semibold text-[#1B2B4B] transition hover:bg-[#D4A843]/30"
                        >
                          შეფასება
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="mt-3 text-xs font-semibold uppercase text-slate-500">შეტყობინება</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800 [overflow-wrap:anywhere]">
                    {selected.message}
                  </p>
                  <p className="mt-4 text-xs text-slate-400">{formatDate(selected.createdAt)}</p>
                </>
              ) : (
                <p className="text-sm text-slate-500">აირჩიე საუბარი მარცხნივ სრული ტექსტის სანახავად.</p>
              )}
            </div>
          </div>
        )}
      </main>

      {reviewModalThread ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && !reviewSubmitting) setReviewModalThread(null)
          }}
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#1B2B4B]">ლისტინგის შეთავაზების შეფასება</h3>
            <p className="mt-1 text-sm text-slate-600">
              {reviewModalThread.peerName} — {reviewModalThread.listingTitle}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              შეაფასე პარტნიორი 1-დან 5 ვარსკვლაურამდე და დაწერე მოკლე კომენტარი (მინ. 10 სიმბოლო).
            </p>

            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">შეფასება</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setReviewStars(n)}
                    className={`h-10 w-10 rounded-lg border text-sm font-bold transition ${
                      reviewStars === n
                        ? "border-[#D4A843] bg-[#D4A843] text-[#1B2B4B]"
                        : "border-slate-200 bg-white text-slate-600 hover:border-[#D4A843]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">კომენტარი</span>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={4}
                className="w-full min-w-0 max-w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#D4A843] focus:ring-2"
                placeholder="როგორ მოგეწონა თანამშრომლობა?"
              />
            </label>

            {reviewError ? <p className="mt-2 text-sm text-red-600">{reviewError}</p> : null}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={reviewSubmitting}
                onClick={() => void submitInquiryReview()}
                className="flex-1 rounded-lg bg-[#1B2B4B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-60"
              >
                {reviewSubmitting ? "ინახება…" : "გაგზავნა"}
              </button>
              <button
                type="button"
                disabled={reviewSubmitting}
                onClick={() => setReviewModalThread(null)}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                გაუქმება
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
