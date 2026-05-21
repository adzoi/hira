import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import ChatIcon from "../components/ui/ChatIcon.tsx"
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
import { LIMITS, validateUuid } from "../lib/validation.ts"

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
  const activeIdRef = useRef<string | null>(activeId)
  const scrollBehaviorRef = useRef<ScrollBehavior>("auto")
  const startChatInFlightRef = useRef(false)

  const validatedActiveId = useMemo(() => {
    if (!activeId) return null
    const result = validateUuid(activeId, "საუბარი")
    return result.ok ? result.value : null
  }, [activeId])

  useEffect(() => {
    activeIdRef.current = validatedActiveId
  }, [validatedActiveId])

  useEffect(() => {
    otherLastReadAtRef.current = otherLastReadAt
  }, [otherLastReadAt])

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === validatedActiveId) ?? null,
    [conversations, validatedActiveId],
  )

  const loadConversations = useCallback(async (opts?: { silent?: boolean }) => {
    if (!isSupabaseConfigured || !supabase) {
      setListError("Supabase არ არის კონფიგურირებული.")
      setConversations([])
      setLoadingList(false)
      return
    }
    if (!opts?.silent) {
      setLoadingList(true)
      setListError("")
    }
    try {
      const list = await fetchConversations(supabase)
      setConversations(list)
      const hrefs = await resolveProfilePublicHrefByIds(list.map((c) => c.otherUserId))
      setProfileHrefs(hrefs)
    } catch (e) {
      if (!opts?.silent) {
        setListError(e instanceof Error ? e.message : "საუბრების ჩატვირთვა ვერ მოხერხდა.")
      }
    } finally {
      if (!opts?.silent) {
        setLoadingList(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (!routeConversationId) {
      setActiveId(null)
      setMessages([])
      setOtherLastReadAt(null)
      setMeId("")
      setThreadError("")
      return
    }
    const result = validateUuid(routeConversationId, "საუბარი")
    if (result.ok === false) {
      setThreadError(result.message)
      navigate("/messages", { replace: true })
      return
    }
    setActiveId(result.value)
  }, [routeConversationId, navigate])

  useEffect(() => {
    const withUserRaw = searchParams.get("with")?.trim()
    if (!withUserRaw || !supabase) return

    const withUserResult = validateUuid(withUserRaw, "მომხმარებელი")
    if (withUserResult.ok === false) {
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
      if (inquiryResult.ok === false) {
        setListError(inquiryResult.message)
        setSearchParams({}, { replace: true })
        return
      }
      serviceInquiryId = inquiryResult.value
    }
    if (applicationRaw) {
      const applicationResult = validateUuid(applicationRaw, "განცხადება")
      if (applicationResult.ok === false) {
        setListError(applicationResult.message)
        setSearchParams({}, { replace: true })
        return
      }
      jobApplicationId = applicationResult.value
    }

    if (startChatInFlightRef.current) return
    startChatInFlightRef.current = true

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
      } finally {
        if (!cancelled) startChatInFlightRef.current = false
      }
    })()

    return () => {
      cancelled = true
      startChatInFlightRef.current = false
    }
  }, [searchParams, setSearchParams, navigate, loadConversations])

  const bumpConversationInList = useCallback(
    (conversationId: string, preview: string, at: string, markUnread: boolean) => {
      const normalizedPreview = preview.replace(/\s+/g, " ").trim()
      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.id !== conversationId) return c
          const unreadCount = markUnread ? c.unreadCount + 1 : 0
          return {
            ...c,
            lastMessagePreview: normalizedPreview,
            lastMessageAt: at,
            unread: markUnread,
            unreadCount,
          }
        })
        const active = updated.find((c) => c.id === conversationId)
        if (!active) return updated
        return [active, ...updated.filter((c) => c.id !== conversationId)]
      })
    },
    [],
  )

  const openConversation = useCallback(
    (id: string) => {
      const result = validateUuid(id, "საუბარი")
      if (result.ok === false) return
      setActiveId(result.value)
      navigate(`/messages/${result.value}`)
    },
    [navigate],
  )

  const loadThread = useCallback(async (conversationId: string) => {
    if (!supabase) return
    setLoadingThread(true)
    setThreadError("")
    try {
      const { messages: rows, meId: uid, otherLastReadAt: otherRead } = await fetchMessages(supabase, conversationId)
      if (activeIdRef.current !== conversationId) return
      setMessages(rows)
      setMeId(uid)
      setOtherLastReadAt(otherRead)
      await markConversationRead(supabase, conversationId)
      if (activeIdRef.current !== conversationId) return
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unread: false, unreadCount: 0 } : c)),
      )
    } catch (e) {
      if (activeIdRef.current !== conversationId) return
      setThreadError(e instanceof Error ? e.message : "შეტყობინებების ჩატვირთვა ვერ მოხერხდა.")
      setMessages([])
    } finally {
      if (activeIdRef.current === conversationId) {
        setLoadingThread(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!validatedActiveId || !supabase) {
      setMessages([])
      return
    }
    let cancelled = false
    void loadThread(validatedActiveId).then(() => {
      if (!cancelled) scrollBehaviorRef.current = "auto"
    })
    return () => {
      cancelled = true
    }
  }, [validatedActiveId, loadThread])

  useEffect(() => {
    const client = supabase
    if (!validatedActiveId || !client || !meId) return

    const messagesChannel = subscribeToConversationMessages(client, validatedActiveId, meId, {
      onInsert: (msg) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev
          const next = [...prev, msg]
          return applyReadReceipts(next, otherLastReadAtRef.current)
        })
        bumpConversationInList(validatedActiveId, msg.body, msg.createdAt, false)
        if (!msg.isOwn) {
          void markConversationRead(client, validatedActiveId)
        }
      },
    })

    const readsChannel = subscribeToConversationReads(client, validatedActiveId, {
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
  }, [validatedActiveId, meId, bumpConversationInList])

  useEffect(() => {
    scrollBehaviorRef.current = "auto"
  }, [validatedActiveId])

  useEffect(() => {
    if (messages.length === 0) return
    messagesEndRef.current?.scrollIntoView({ behavior: scrollBehaviorRef.current })
    scrollBehaviorRef.current = "smooth"
  }, [messages])

  const handleSend = async () => {
    if (!supabase || !validatedActiveId || sending) return
    const text = draft.trim()
    if (!text) return
    setSending(true)
    try {
      const msg = await sendMessage(supabase, validatedActiveId, text)
      setDraft("")
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      bumpConversationInList(validatedActiveId, msg.body, msg.createdAt, false)
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

  const showThreadOnMobile = Boolean(validatedActiveId)

  useEffect(() => {
    if (!showThreadOnMobile || window.matchMedia("(min-width: 768px)").matches) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [showThreadOnMobile])

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
    <div
      className={`page-enter flex min-h-dvh flex-col bg-[#f8f9fc ${showThreadOnMobile ? "h-dvh overflow-hidden" : ""}`}
    >
      <Navbar />
      <main
        className={`mx-auto flex w-full max-w-[1200px] min-h-0 flex-1 flex-col ${
          showThreadOnMobile ? "px-0 pb-0 pt-0 md:px-4 md:py-8" : "px-4 py-6 md:py-8"
        }`}
      >
        <header className={`shrink-0 ${showThreadOnMobile ? "mb-4 hidden md:block md:mb-6" : "mb-4 md:mb-6"}`}>
          <h1 className="text-2xl font-bold text-[#1B2B4B] md:text-3xl">ჩათი</h1>
          <p className="mt-1 text-sm text-slate-600">მიმოწერა დამქირავებლებსა და ფრილანსერებთან</p>
        </header>

        <div
          className={`flex min-h-0 flex-1 overflow-hidden bg-white shadow-sm md:h-[min(72vh,640px)] md:flex-none ${
            showThreadOnMobile
              ? "border-t border-slate-200 md:rounded-2xl md:border"
              : "h-[min(calc(100dvh-12rem),640px)] rounded-2xl border border-slate-200"
          }`}
        >
          <aside
            className={`flex w-full shrink-0 flex-col border-r border-slate-100 md:w-[320px] lg:w-[360px] ${
              showThreadOnMobile ? "hidden md:flex" : "flex"
            }`}
          >
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-[#1B2B4B]">საუბრები</p>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain">
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
                    const selected = c.id === validatedActiveId
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
                          {c.unreadCount > 0 ? (
                            <span className="mt-1 flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                              {c.unreadCount > 99 ? "99+" : c.unreadCount}
                            </span>
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
            {!validatedActiveId ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-slate-500">
                <ChatIcon className="h-12 w-12 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">აირჩიეთ საუბარი ან დაიწყეთ ახალი</p>
              </div>
            ) : (
              <>
                <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-3 py-3 sm:px-4">
                  <button
                    type="button"
                    aria-label="საუბრების სიაში დაბრუნება"
                    className="-ml-1 rounded-lg px-2 py-1.5 text-lg leading-none text-slate-600 hover:bg-slate-100 md:hidden"
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

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/50 px-3 py-4 sm:px-4">
                  {loadingThread ? (
                    <div className="flex justify-center py-12">
                      <PageLoader />
                    </div>
                  ) : threadError ? (
                    <ErrorState
                      message={threadError}
                      onRetry={() => validatedActiveId && void loadThread(validatedActiveId)}
                    />
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

                <div className="shrink-0 border-t border-slate-100 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={composerRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value.slice(0, LIMITS.chatMessage))}
                      onKeyDown={onComposerKeyDown}
                      rows={1}
                      maxLength={LIMITS.chatMessage}
                      placeholder="დაწერეთ შეტყობინება…"
                      className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-base text-[#1B2B4B] outline-none focus:border-[#0088FF] focus:ring-2 focus:ring-[#0088FF]/20 sm:text-sm"
                    />
                    <button
                      type="button"
                      disabled={sending || !draft.trim()}
                      aria-label="გაგზავნა"
                      onClick={() => void handleSend()}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0088FF] text-sm font-semibold text-white transition hover:bg-[#006ACC] disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-auto sm:px-4"
                    >
                      {sending ? (
                        "…"
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 sm:hidden" fill="currentColor">
                            <path d="M3.4 20.4 22 12 3.4 3.6l2.8 7.2L17 12l-10.8 1.2-2.8 7.2z" />
                          </svg>
                          <span className="hidden sm:inline">გაგზავნა</span>
                        </>
                      )}
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
