import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import EmptyState from "../components/ui/EmptyState.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import PageLoader from "../components/ui/PageLoader.tsx"
import {
  applyReadReceipts,
  fetchConversations,
  fetchMessages,
  getOrCreateConversation,
  markConversationRead,
  readReceiptLabel,
  resolveAvatarSrc,
  sendMessage,
  type ChatConversation,
  type ChatMessage,
} from "../lib/chat.ts"
import { subscribeToConversationMessages, subscribeToConversationReads } from "../lib/chatRealtime.ts"
import { resolveProfilePublicHrefByIds } from "../lib/follows.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase.ts"
import { validateUuid } from "../lib/validation.ts"

function formatRelativeTime(iso: string | null): string {
  if (!iso) return ""
  const now = Date.now()
  const diffMs = now - new Date(iso).getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return "ახლახან"
  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))} წთ`
  if (diffMs < day) return `${Math.max(1, Math.floor(diffMs / hour))} სთ`
  if (diffMs < 7 * day) return `${Math.max(1, Math.floor(diffMs / day))} დღე`
  return new Date(iso).toLocaleDateString("ka-GE")
}

function initials(name: string): string {
  const parts = name.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "?"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function Avatar({
  name,
  avatarUrl,
  size = "md",
}: {
  name: string
  avatarUrl: string | null
  size?: "sm" | "md"
}) {
  const dim = size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm"
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#E8F4FF] font-bold text-[#1B2B4B] ${dim}`}
    >
      {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  )
}

function ProfileLink({
  href,
  className = "",
  stopPropagation = false,
  children,
}: {
  href: string | undefined
  className?: string
  stopPropagation?: boolean
  children: ReactNode
}) {
  if (!href) return <>{children}</>
  return (
    <Link
      to={href}
      className={className}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      {children}
    </Link>
  )
}

export default function MessagesPage() {
  const { conversationId: routeConversationId } = useParams<{ conversationId?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState("")
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [profileHrefs, setProfileHrefs] = useState<Record<string, string>>({})
  const [activeId, setActiveId] = useState<string | null>(routeConversationId ?? null)

  const [loadingThread, setLoadingThread] = useState(false)
  const [threadError, setThreadError] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [meId, setMeId] = useState("")
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const otherLastReadAtRef = useRef<string | null>(null)

  useEffect(() => {
    otherLastReadAtRef.current = otherLastReadAt
  }, [otherLastReadAt])

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  )

  const loadConversations = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setListError("Supabase არ არის კონფიგურირებული.")
      setConversations([])
      setLoadingList(false)
      return
    }
    setLoadingList(true)
    setListError("")
    try {
      const list = await fetchConversations(supabase)
      setConversations(list)
      const hrefs = await resolveProfilePublicHrefByIds(list.map((c) => c.otherUserId))
      setProfileHrefs(hrefs)
    } catch (e) {
      setListError(e instanceof Error ? e.message : "საუბრების ჩატვირთვა ვერ მოხერხდა.")
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (routeConversationId) {
      setActiveId(routeConversationId)
    }
  }, [routeConversationId])

  useEffect(() => {
    const withUserRaw = searchParams.get("with")?.trim()
    if (!withUserRaw || !supabase) return

    const withUserResult = validateUuid(withUserRaw, "მომხმარებელი")
    if (!withUserResult.ok) {
      setListError(withUserResult.message)
      setSearchParams({}, { replace: true })
      return
    }
    const withUser = withUserResult.value

    const inquiryRaw = searchParams.get("inquiry")?.trim()
    const applicationRaw = searchParams.get("application")?.trim()
    let serviceInquiryId: string | undefined
    let jobApplicationId: string | undefined
    if (inquiryRaw) {
      const inquiryResult = validateUuid(inquiryRaw, "შეთავაზება")
      if (!inquiryResult.ok) {
        setListError(inquiryResult.message)
        setSearchParams({}, { replace: true })
        return
      }
      serviceInquiryId = inquiryResult.value
    }
    if (applicationRaw) {
      const applicationResult = validateUuid(applicationRaw, "განცხადება")
      if (!applicationResult.ok) {
        setListError(applicationResult.message)
        setSearchParams({}, { replace: true })
        return
      }
      jobApplicationId = applicationResult.value
    }

    let cancelled = false
    void (async () => {
      try {
        const id = await getOrCreateConversation(supabase, withUser, {
          serviceInquiryId,
          jobApplicationId,
        })
        if (cancelled) return
        setSearchParams({}, { replace: true })
        navigate(`/messages/${id}`, { replace: true })
        await loadConversations()
      } catch (e) {
        if (!cancelled) {
          setListError(e instanceof Error ? e.message : "საუბრის შექმნა ვერ მოხერხდა.")
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [searchParams, setSearchParams, navigate, loadConversations])

  const openConversation = useCallback(
    (id: string) => {
      setActiveId(id)
      navigate(`/messages/${id}`)
    },
    [navigate],
  )

  const loadThread = useCallback(async (conversationId: string) => {
    if (!supabase) return
    setLoadingThread(true)
    setThreadError("")
    try {
      const { messages: rows, meId: uid, otherLastReadAt: otherRead } = await fetchMessages(supabase, conversationId)
      setMessages(rows)
      setMeId(uid)
      setOtherLastReadAt(otherRead)
      await markConversationRead(supabase, conversationId)
      setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, unread: false } : c)))
    } catch (e) {
      setThreadError(e instanceof Error ? e.message : "შეტყობინებების ჩატვირთვა ვერ მოხერხდა.")
      setMessages([])
    } finally {
      setLoadingThread(false)
    }
  }, [])

  useEffect(() => {
    if (!activeId || !supabase) {
      setMessages([])
      return
    }
    void loadThread(activeId)
  }, [activeId, loadThread])

  useEffect(() => {
    const client = supabase
    if (!activeId || !client || !meId) return

    const messagesChannel = subscribeToConversationMessages(client, activeId, meId, {
      onInsert: (msg) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev
          const next = [...prev, msg]
          return applyReadReceipts(next, otherLastReadAtRef.current)
        })
        if (!msg.isOwn) {
          void markConversationRead(client, activeId)
        }
        void loadConversations()
      },
    })

    const readsChannel = subscribeToConversationReads(client, activeId, {
      onReadUpdate: ({ userId, lastReadAt }) => {
        if (userId === meId) return
        setOtherLastReadAt(lastReadAt)
        setMessages((prev) => applyReadReceipts(prev, lastReadAt))
      },
    })

    return () => {
      void client.removeChannel(messagesChannel)
      void client.removeChannel(readsChannel)
    }
  }, [activeId, meId, loadConversations])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, activeId])

  const handleSend = async () => {
    if (!supabase || !activeId || sending) return
    const text = draft.trim()
    if (!text) return
    setSending(true)
    try {
      const msg = await sendMessage(supabase, activeId, text)
      setDraft("")
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                lastMessagePreview: msg.body,
                lastMessageAt: msg.createdAt,
                unread: false,
              }
            : c,
        ),
      )
      composerRef.current?.focus()
    } catch (e) {
      setThreadError(e instanceof Error ? e.message : "გაგზავნა ვერ მოხერხდა.")
    } finally {
      setSending(false)
    }
  }

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const showThreadOnMobile = Boolean(activeId)

  if (!isSupabaseConfigured) {
    return (
      <div className="page-enter min-h-screen bg-[#f8f9fc]">
        <Navbar />
        <main className="mx-auto max-w-[1200px] px-4 py-8">
          <ErrorState message="Supabase არ არის კონფიგურირებული." />
        </main>
      </div>
    )
  }

  return (
    <div className="page-enter min-h-screen bg-[#f8f9fc]">
      <Navbar />
      <main className="mx-auto max-w-[1200px] px-4 py-6 md:py-8">
        <header className="mb-4 md:mb-6">
          <h1 className="text-2xl font-bold text-[#1B2B4B] md:text-3xl">ჩათი</h1>
          <p className="mt-1 text-sm text-slate-600">მიმოწერა დამქირავებლებსა და ფრილანსერებთან</p>
        </header>

        <div className="flex h-[min(72vh,640px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <aside
            className={`flex w-full shrink-0 flex-col border-r border-slate-100 md:w-[320px] lg:w-[360px] ${
              showThreadOnMobile ? "hidden md:flex" : "flex"
            }`}
          >
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-[#1B2B4B]">საუბრები</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingList ? (
                <div className="flex justify-center py-12">
                  <PageLoader />
                </div>
              ) : listError ? (
                <div className="p-4">
                  <ErrorState message={listError} onRetry={() => void loadConversations()} />
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-4">
                  <EmptyState message="საუბრები ჯერ არ გაქვთ. დაიწყეთ მიმოწერა პროფილიდან ან დეშბორდიდან." />
                </div>
              ) : (
                <ul>
                  {conversations.map((c) => {
                    const avatar = supabase ? resolveAvatarSrc(supabase, c.otherAvatarUrl) : null
                    const selected = c.id === activeId
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => openConversation(c.id)}
                          className={`flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 ${
                            selected ? "bg-[#E8F4FF]/60" : ""
                          }`}
                        >
                          <ProfileLink
                            href={profileHrefs[c.otherUserId]}
                            className="shrink-0 rounded-full transition hover:opacity-80"
                            stopPropagation
                          >
                            <Avatar name={c.otherName} avatarUrl={avatar} size="sm" />
                          </ProfileLink>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <ProfileLink
                                href={profileHrefs[c.otherUserId]}
                                className={`min-w-0 truncate text-sm transition hover:text-[#0088FF] ${c.unread ? "font-bold text-[#1B2B4B]" : "font-semibold text-[#1B2B4B]"}`}
                                stopPropagation
                              >
                                {c.otherName}
                              </ProfileLink>
                              {c.lastMessageAt ? (
                                <span className="shrink-0 text-[11px] text-slate-400">
                                  {formatRelativeTime(c.lastMessageAt)}
                                </span>
                              ) : null}
                            </div>
                            {c.contextLabel ? (
                              <p className="truncate text-[11px] text-[#0088FF]">{c.contextLabel}</p>
                            ) : null}
                            {c.lastMessagePreview ? (
                              <p
                                className={`mt-0.5 truncate text-xs ${c.unread ? "font-medium text-slate-700" : "text-slate-500"}`}
                              >
                                {c.lastMessagePreview}
                              </p>
                            ) : (
                              <p className="mt-0.5 text-xs text-slate-400">საუბარი დაიწყეთ</p>
                            )}
                          </div>
                          {c.unread ? (
                            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#0088FF]" aria-hidden />
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </aside>

          <section className={`flex min-w-0 flex-1 flex-col ${showThreadOnMobile ? "flex" : "hidden md:flex"}`}>
            {!activeId ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-slate-500">
                <svg viewBox="0 0 24 24" className="h-12 w-12 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 10h8M8 14h5M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H9.5L6 8.5V18a2 2 0 0 0 2 2z"
                  />
                </svg>
                <p className="text-sm font-medium text-slate-600">აირჩიეთ საუბარი ან დაიწყეთ ახალი</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 md:hidden"
                    onClick={() => {
                      setActiveId(null)
                      navigate("/messages")
                    }}
                  >
                    ←
                  </button>
                  {activeConversation ? (
                    <>
                      <ProfileLink
                        href={profileHrefs[activeConversation.otherUserId]}
                        className="shrink-0 rounded-full transition hover:opacity-80"
                      >
                        <Avatar
                          name={activeConversation.otherName}
                          avatarUrl={supabase ? resolveAvatarSrc(supabase, activeConversation.otherAvatarUrl) : null}
                        />
                      </ProfileLink>
                      <div className="min-w-0">
                        <ProfileLink
                          href={profileHrefs[activeConversation.otherUserId]}
                          className="block truncate font-semibold text-[#1B2B4B] transition hover:text-[#0088FF]"
                        >
                          {activeConversation.otherName}
                        </ProfileLink>
                        {activeConversation.contextLabel ? (
                          <p className="truncate text-xs text-slate-500">{activeConversation.contextLabel}</p>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <p className="font-semibold text-[#1B2B4B]">საუბარი</p>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50/50 px-4 py-4">
                  {loadingThread ? (
                    <div className="flex justify-center py-12">
                      <PageLoader />
                    </div>
                  ) : threadError ? (
                    <ErrorState message={threadError} onRetry={() => activeId && void loadThread(activeId)} />
                  ) : messages.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500">პირველი შეტყობინება გაგზავნეთ.</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {messages.map((m) => (
                        <li key={m.id} className={`flex ${m.isOwn ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                              m.isOwn
                                ? "rounded-br-md bg-[#0088FF] text-white"
                                : "rounded-bl-md border border-slate-200 bg-white text-[#1B2B4B]"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            <div
                              className={`mt-1 flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[10px] ${
                                m.isOwn ? "text-white/70" : "text-slate-400"
                              }`}
                            >
                              <span>{formatRelativeTime(m.createdAt)}</span>
                              {readReceiptLabel(m.isOwn, m.readByOther) ? (
                                <span className={m.readByOther ? "font-medium text-white/90" : ""}>
                                  {m.readByOther ? "✓✓" : "✓"} {readReceiptLabel(m.isOwn, m.readByOther)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      ))}
                      <div ref={messagesEndRef} />
                    </ul>
                  )}
                </div>

                <div className="border-t border-slate-100 bg-white p-3 md:p-4">
                  <div className="flex gap-2">
                    <textarea
                      ref={composerRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={onComposerKeyDown}
                      rows={2}
                      placeholder="დაწერეთ შეტყობინება…"
                      className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-[#1B2B4B] outline-none focus:border-[#0088FF] focus:ring-2 focus:ring-[#0088FF]/20"
                    />
                    <button
                      type="button"
                      disabled={sending || !draft.trim()}
                      onClick={() => void handleSend()}
                      className="flex h-11 shrink-0 items-center justify-center self-end rounded-xl bg-[#0088FF] px-4 text-sm font-semibold text-white transition hover:bg-[#006ACC] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sending ? "…" : "გაგზავნა"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
