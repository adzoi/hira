import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import ChatIcon from "../components/ui/ChatIcon.tsx"
import EmptyState from "../components/ui/EmptyState.tsx"
import ErrorState from "../components/ui/ErrorState.tsx"
import PageLoader from "../components/ui/PageLoader.tsx"
import {
  applyReadReceipts,
  getOrCreateConversation,
  markConversationRead,
  readReceiptLabel,
  resolveAvatarSrc,
  sendMessage,
  type ChatConversation,
  type ChatMessage,
} from "../lib/chat.ts"
import { subscribeToConversationBroadcast, subscribeToInboxBroadcast } from "../lib/chatBroadcast.ts"
import type { ChatBroadcastPayload } from "../lib/chatBroadcast.ts"
import { oncePerChatMessage } from "../lib/chatMessageDedup.ts"
import {
  subscribeToChatInbox,
  subscribeToConversationMessages,
  subscribeToConversationReads,
} from "../lib/chatRealtime.ts"
import { fetchMessagesList } from "../lib/queries/fetchMessagesList.ts"
import { fetchMessagesThread } from "../lib/queries/fetchMessagesThread.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { unreadCountsQueryKey } from "../lib/unreadCountsCache.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase.ts"
import { LIMITS, validateUuid } from "../lib/validation.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"

function formatRelativeTime(iso: string | null, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (!iso) return ""
  const now = Date.now()
  const diffMs = now - new Date(iso).getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return t("nav.justNow")
  if (diffMs < hour) return t("nav.minutesAgo", { count: Math.max(1, Math.floor(diffMs / minute)) })
  if (diffMs < day) return t("nav.hoursAgo", { count: Math.max(1, Math.floor(diffMs / hour)) })
  if (diffMs < 7 * day) return t("nav.daysAgo", { count: Math.max(1, Math.floor(diffMs / day)) })
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
  const { t } = useTranslation()
  const { conversationId: routeConversationId } = useParams<{ conversationId?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [listValidationError, setListValidationError] = useState("")
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [profileHrefs, setProfileHrefs] = useState<Record<string, string>>({})
  const [activeId, setActiveId] = useState<string | null>(routeConversationId ?? null)
  const [messagesUserId, setMessagesUserId] = useState("")

  const [threadValidationError, setThreadValidationError] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [meId, setMeId] = useState("")
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const threadViewportRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const composerBarRef = useRef<HTMLDivElement>(null)
  const otherLastReadAtRef = useRef<string | null>(null)
  const activeIdRef = useRef<string | null>(activeId)
  const scrollBehaviorRef = useRef<ScrollBehavior>("auto")
  const startChatInFlightRef = useRef(false)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [composerHeight, setComposerHeight] = useState(72)

  const validatedActiveId = useMemo(() => {
    if (!activeId) return null
    const result = validateUuid(activeId, t("messages.conversation"))
    return result.ok ? result.value : null
  }, [activeId])

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setMessagesUserId(user?.id ?? "")
    })
  }, [])

  const {
    data: listData,
    isLoading: loadingList,
    isError: listIsError,
    error: listQueryError,
    refetch: refetchConversations,
  } = useQuery({
    queryKey: queryKeys.messagesList(messagesUserId),
    queryFn: fetchMessagesList,
    enabled: Boolean(messagesUserId) && isSupabaseConfigured,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  })
  const listError =
    listValidationError || (listIsError ? queryErrorMessage(listQueryError, t("messages.loadConversationsFailed")) : "")

  useEffect(() => {
    if (!listData) return
    setConversations(listData.conversations)
    setProfileHrefs(listData.profileHrefs)
  }, [listData])

  const {
    data: threadData,
    isLoading: loadingThread,
    isError: threadIsError,
    error: threadQueryError,
    refetch: refetchThread,
  } = useQuery({
    queryKey: queryKeys.messagesThread(validatedActiveId ?? ""),
    queryFn: () => fetchMessagesThread(validatedActiveId!),
    enabled: Boolean(validatedActiveId) && isSupabaseConfigured,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  const threadError =
    threadValidationError ||
    (threadIsError ? queryErrorMessage(threadQueryError, t("messages.loadMessagesFailed")) : "")

  useEffect(() => {
    if (!threadData || !validatedActiveId || !supabase) return
    if (activeIdRef.current !== validatedActiveId) return
    setMessages(threadData.messages)
    setMeId(threadData.meId)
    setOtherLastReadAt(threadData.otherLastReadAt)
    void markConversationRead(supabase, validatedActiveId).then(() => {
      if (activeIdRef.current !== validatedActiveId) return
      setConversations((prev) =>
        prev.map((c) => (c.id === validatedActiveId ? { ...c, unread: false, unreadCount: 0 } : c)),
      )
    })
  }, [threadData, validatedActiveId])

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

  useEffect(() => {
    if (!routeConversationId) {
      setActiveId(null)
      setMessages([])
      setOtherLastReadAt(null)
      setMeId("")
      setThreadValidationError("")
      return
    }
    const result = validateUuid(routeConversationId, t("messages.conversation"))
    if (result.ok === false) {
      setThreadValidationError(result.message)
      navigate("/messages", { replace: true })
      return
    }
    setActiveId(result.value)
  }, [routeConversationId, navigate])

  useEffect(() => {
    const withUserRaw = searchParams.get("with")?.trim()
    if (!withUserRaw || !supabase) return

    const withUserResult = validateUuid(withUserRaw, t("nav.user"))
    if (withUserResult.ok === false) {
      setListValidationError(withUserResult.message)
      setSearchParams({}, { replace: true })
      return
    }
    const withUser = withUserResult.value

    const inquiryRaw = searchParams.get("inquiry")?.trim()
    const applicationRaw = searchParams.get("application")?.trim()
    let serviceInquiryId: string | undefined
    let jobApplicationId: string | undefined
    if (inquiryRaw) {
      const inquiryResult = validateUuid(inquiryRaw, t("nav.proposedRate"))
      if (inquiryResult.ok === false) {
        setListValidationError(inquiryResult.message)
        setSearchParams({}, { replace: true })
        return
      }
      serviceInquiryId = inquiryResult.value
    }
    if (applicationRaw) {
      const applicationResult = validateUuid(applicationRaw, t("common.applicants"))
      if (applicationResult.ok === false) {
        setListValidationError(applicationResult.message)
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
        await refetchConversations()
      } catch (e) {
        if (!cancelled) {
          setListValidationError(e instanceof Error ? e.message : t("messages.createConversationFailed"))
        }
      } finally {
        if (!cancelled) startChatInFlightRef.current = false
      }
    })()

    return () => {
      cancelled = true
      startChatInFlightRef.current = false
    }
  }, [searchParams, setSearchParams, navigate, refetchConversations])

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
      const result = validateUuid(id, t("messages.conversation"))
      if (result.ok === false) return
      setActiveId(result.value)
      navigate(`/messages/${result.value}`)
    },
    [navigate],
  )

  useEffect(() => {
    const client = supabase
    if (!validatedActiveId || !client || !meId) return

    const applyIncomingMessage = (msg: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        const next = [...prev, msg]
        return applyReadReceipts(next, otherLastReadAtRef.current)
      })
      bumpConversationInList(validatedActiveId, msg.body, msg.createdAt, false)
      if (!msg.isOwn) {
        void markConversationRead(client, validatedActiveId)
      }
      oncePerChatMessage(msg.id, () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.messagesThread(validatedActiveId) })
        if (messagesUserId) {
          void queryClient.invalidateQueries({ queryKey: unreadCountsQueryKey(messagesUserId) })
        }
      })
    }

    const messagesChannel = subscribeToConversationMessages(client, validatedActiveId, meId, {
      onInsert: applyIncomingMessage,
    })

    const broadcastChannel = subscribeToConversationBroadcast(client, validatedActiveId, meId, applyIncomingMessage)

    const readsChannel = subscribeToConversationReads(client, validatedActiveId, {
      onReadUpdate: ({ userId, lastReadAt }) => {
        if (userId === meId) return
        setOtherLastReadAt(lastReadAt)
        setMessages((prev) => applyReadReceipts(prev, lastReadAt))
      },
    })

    return () => {
      messagesChannel.unsubscribe()
      broadcastChannel.unsubscribe()
      readsChannel.unsubscribe()
      void client.removeChannel(messagesChannel)
      void client.removeChannel(broadcastChannel)
      void client.removeChannel(readsChannel)
    }
  }, [validatedActiveId, meId, bumpConversationInList, queryClient, messagesUserId])

  const processInboxMessage = useCallback(
    (payload: ChatBroadcastPayload) => {
      oncePerChatMessage(payload.messageId, () => {
        if (payload.senderId === messagesUserId) return
        bumpConversationInList(payload.conversationId, payload.body, payload.createdAt, false)
        void queryClient.invalidateQueries({ queryKey: queryKeys.messagesList(messagesUserId) })
        void queryClient.invalidateQueries({ queryKey: queryKeys.messagesThread(payload.conversationId) })
        if (messagesUserId) {
          void queryClient.invalidateQueries({ queryKey: unreadCountsQueryKey(messagesUserId) })
        }
      })
    },
    [messagesUserId, bumpConversationInList, queryClient],
  )

  useEffect(() => {
    const client = supabase
    if (!client || !messagesUserId) return

    const inboxChannel = subscribeToChatInbox(client, messagesUserId, (event) => {
      if (event.kind === "message") {
        processInboxMessage({
          messageId: event.messageId,
          conversationId: event.conversationId,
          senderId: event.senderId,
          senderName: "",
          body: event.body,
          createdAt: event.createdAt,
        })
        return
      }
      void refetchConversations()
      if (messagesUserId) {
        void queryClient.invalidateQueries({ queryKey: unreadCountsQueryKey(messagesUserId) })
      }
    })

    const { unsubscribe: unsubscribeInboxBroadcast } = subscribeToInboxBroadcast(
      client,
      messagesUserId,
      processInboxMessage,
    )

    return () => {
      inboxChannel.unsubscribe()
      unsubscribeInboxBroadcast()
      void client.removeChannel(inboxChannel)
    }
  }, [messagesUserId, processInboxMessage, refetchConversations, queryClient])

  useEffect(() => {
    scrollBehaviorRef.current = "auto"
  }, [validatedActiveId])

  useEffect(() => {
    if (threadData && validatedActiveId) {
      scrollBehaviorRef.current = "auto"
    }
  }, [threadData, validatedActiveId])

  useEffect(() => {
    if (messages.length === 0) return
    const viewport = threadViewportRef.current
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: scrollBehaviorRef.current })
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: scrollBehaviorRef.current, block: "end" })
    }
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
      setThreadValidationError(e instanceof Error ? e.message : t("messages.sendFailed"))
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

  const mobileThreadActive = Boolean(validatedActiveId)

  useEffect(() => {
    if (!mobileThreadActive || window.matchMedia("(min-width: 768px)").matches) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileThreadActive])

  useEffect(() => {
    if (!mobileThreadActive || window.matchMedia("(min-width: 768px)").matches) {
      setKeyboardInset(0)
      return
    }

    const vv = window.visualViewport
    if (!vv) return

    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setKeyboardInset(inset)
      if (inset > 0) {
        requestAnimationFrame(() => {
          threadViewportRef.current?.scrollTo({
            top: threadViewportRef.current.scrollHeight,
            behavior: "smooth",
          })
        })
      }
    }

    vv.addEventListener("resize", updateKeyboardInset)
    vv.addEventListener("scroll", updateKeyboardInset)
    updateKeyboardInset()
    return () => {
      vv.removeEventListener("resize", updateKeyboardInset)
      vv.removeEventListener("scroll", updateKeyboardInset)
    }
  }, [mobileThreadActive, validatedActiveId])

  useEffect(() => {
    const bar = composerBarRef.current
    if (!bar) return
    const updateHeight = () => setComposerHeight(bar.offsetHeight)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [validatedActiveId, mobileThreadActive, draft])

  const scrollThreadToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    threadViewportRef.current?.scrollTo({
      top: threadViewportRef.current.scrollHeight,
      behavior,
    })
  }, [])

  const onComposerFocus = () => {
    if (!mobileThreadActive || window.matchMedia("(min-width: 768px)").matches) return
    window.setTimeout(() => scrollThreadToBottom("smooth"), 300)
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="page-enter min-h-screen bg-[#f8f9fc]">
        <main className="mx-auto max-w-[1200px] px-4 py-8">
          <ErrorState message={t("validation.supabaseMissing")} />
        </main>
      </div>
    )
  }

  return (
    <div
      className={`page-enter bg-[#f8f9fc] ${
        mobileThreadActive
          ? "fixed inset-x-0 bottom-0 top-[4.5rem] z-30 flex flex-col overflow-hidden md:static md:inset-auto md:top-auto md:z-auto md:min-h-dvh md:overflow-visible"
          : "flex min-h-dvh flex-col"
      }`}
    >
      <main
        className={`mx-auto flex w-full max-w-[1200px] min-h-0 flex-1 flex-col ${
          mobileThreadActive ? "overflow-hidden px-0 py-0 md:px-4 md:py-8" : "px-4 py-6 md:py-8"
        }`}
      >
        <header className={`shrink-0 ${mobileThreadActive ? "mb-4 hidden md:block md:mb-6" : "mb-4 md:mb-6"}`}>
          <h1 className="text-2xl font-bold text-[#1B2B4B] md:text-3xl">{t("messages.heading")}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("messages.subtitle")}</p>
        </header>

        <div
          className={`flex min-h-0 flex-1 overflow-hidden bg-white shadow-sm md:h-[min(72vh,640px)] md:flex-none ${
            mobileThreadActive
              ? "border-t border-slate-200 md:rounded-2xl md:border"
              : "h-[min(calc(100dvh-12rem),640px)] rounded-2xl border border-slate-200"
          }`}
        >
          <aside
            className={`flex w-full shrink-0 flex-col border-r border-slate-100 md:w-[320px] lg:w-[360px] ${
              mobileThreadActive ? "hidden md:flex" : "flex"
            }`}
          >
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-[#1B2B4B]">{t("messages.conversations")}</p>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {loadingList ? (
                <div className="flex justify-center py-12">
                  <PageLoader />
                </div>
              ) : listError ? (
                <div className="p-4">
                  <ErrorState message={listError} onRetry={() => void refetchConversations()} />
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-4">
                  <EmptyState message={t("messages.emptyConversations")} />
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
                                  {formatRelativeTime(c.lastMessageAt, t)}
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
                              <p className="mt-0.5 text-xs text-slate-400">{t("messages.startConversation")}</p>
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

          <section className={`flex min-w-0 flex-1 flex-col ${mobileThreadActive ? "flex" : "hidden md:flex"}`}>
            {!validatedActiveId ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-slate-500">
                <ChatIcon className="h-12 w-12 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">{t("messages.selectOrStart")}</p>
              </div>
            ) : (
              <>
                <div className="z-10 flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-3 py-3 sm:px-4">
                  <button
                    type="button"
                    aria-label={t("messages.backToList")}
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
                    <p className="font-semibold text-[#1B2B4B]">{t("messages.conversation")}</p>
                  )}
                </div>

                <div
                  ref={threadViewportRef}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/50 px-3 py-4 sm:px-4"
                  style={
                    mobileThreadActive
                      ? { paddingBottom: `${composerHeight + keyboardInset + 12}px` }
                      : undefined
                  }
                >
                  {loadingThread ? (
                    <div className="flex justify-center py-12">
                      <PageLoader />
                    </div>
                  ) : threadError ? (
                    <ErrorState
                      message={threadError}
                      onRetry={() => validatedActiveId && void refetchThread()}
                    />
                  ) : messages.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500">{t("messages.sendFirst")}</p>
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
                              <span>{formatRelativeTime(m.createdAt, t)}</span>
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

                <div
                  ref={composerBarRef}
                  className={`shrink-0 border-t border-slate-100 bg-white p-3 sm:p-4 md:static ${
                    mobileThreadActive ? "fixed inset-x-0 z-40 md:relative md:inset-auto md:z-auto" : ""
                  }`}
                  style={
                    mobileThreadActive
                      ? {
                          bottom: keyboardInset,
                          paddingBottom:
                            keyboardInset > 0 ? "0.75rem" : "max(0.75rem, env(safe-area-inset-bottom))",
                        }
                      : {
                          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
                        }
                  }
                >
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={composerRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value.slice(0, LIMITS.chatMessage))}
                      onKeyDown={onComposerKeyDown}
                      onFocus={onComposerFocus}
                      rows={1}
                      maxLength={LIMITS.chatMessage}
                      placeholder={t("messages.writeMessage")}
                      className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-base text-[#1B2B4B] outline-none focus:border-[#0088FF] focus:ring-2 focus:ring-[#0088FF]/20 sm:text-sm"
                    />
                    <button
                      type="button"
                      disabled={sending || !draft.trim()}
                      aria-label={t("common.send")}
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
                          <span className="hidden sm:inline">{t("common.send")}</span>
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
