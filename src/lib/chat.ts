import type { SupabaseClient } from "@supabase/supabase-js"
import { avatarImageUrl } from "./storageImageUrl.ts"
import { assertField, LIMITS, validateTextField, validateUuid } from "./validation.ts"

export type ChatMessage = {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
  isOwn: boolean
  /** True when the other participant's last_read_at is at or after this message. */
  readByOther: boolean
}

export function isMessageReadByOther(messageCreatedAt: string, otherLastReadAt: string | null): boolean {
  if (!otherLastReadAt) return false
  return new Date(otherLastReadAt).getTime() >= new Date(messageCreatedAt).getTime()
}

export function readReceiptLabel(isOwn: boolean, readByOther: boolean): string | null {
  if (!isOwn) return null
  return readByOther ? "წაკითხულია" : "გაგზავნილია"
}

export type ChatConversation = {
  id: string
  otherUserId: string
  otherName: string
  otherAvatarUrl: string | null
  lastMessagePreview: string | null
  lastMessageAt: string | null
  unread: boolean
  unreadCount: number
  contextLabel: string | null
}

export type StartConversationOpts = {
  otherUserId: string
  serviceInquiryId?: string | null
  jobApplicationId?: string | null
}

export function startConversationPath(opts: StartConversationOpts): string {
  const params = new URLSearchParams()
  params.set("with", opts.otherUserId)
  if (opts.serviceInquiryId?.trim()) params.set("inquiry", opts.serviceInquiryId.trim())
  if (opts.jobApplicationId?.trim()) params.set("application", opts.jobApplicationId.trim())
  return `/messages?${params.toString()}`
}

/** @deprecated Use startConversationPath */
export function chatWithUserPath(otherUserId: string): string {
  return startConversationPath({ otherUserId })
}

function otherParticipantId(
  conversation: { participant_low: string; participant_high: string },
  me: string,
): string {
  return conversation.participant_low === me ? conversation.participant_high : conversation.participant_low
}

function requireConversationId(conversationId: string): string {
  return assertField(validateUuid(conversationId, "საუბარი"))
}

export async function getOrCreateConversation(
  client: SupabaseClient,
  otherUserId: string,
  opts?: { jobApplicationId?: string; serviceInquiryId?: string },
): Promise<string> {
  const validatedOtherUserId = assertField(validateUuid(otherUserId, "მომხმარებელი"))

  let jobApplicationId: string | null = null
  if (opts?.jobApplicationId) {
    jobApplicationId = assertField(validateUuid(opts.jobApplicationId, "განცხადება"))
  }

  let serviceInquiryId: string | null = null
  if (opts?.serviceInquiryId) {
    serviceInquiryId = assertField(validateUuid(opts.serviceInquiryId, "შეთავაზება"))
  }

  const { data, error } = await client.rpc("get_or_create_conversation", {
    p_other_user_id: validatedOtherUserId,
    p_job_application_id: jobApplicationId,
    p_service_inquiry_id: serviceInquiryId,
  })
  if (error) throw error
  if (!data) throw new Error("Conversation could not be created")
  return String(data)
}

type InboxMessageStats = {
  latestByConv: Map<string, { body: string; created_at: string; sender_id: string }>
  unreadCountMap: Map<string, number>
}

async function fetchInboxMessageStats(
  client: SupabaseClient,
  convIds: string[],
  userId: string,
): Promise<InboxMessageStats> {
  const latestByConv = new Map<string, { body: string; created_at: string; sender_id: string }>()
  const unreadCountMap = new Map<string, number>()
  if (convIds.length === 0) return { latestByConv, unreadCountMap }

  const statsRes = await client.rpc("get_chat_inbox_message_stats")
  if (!statsRes.error && statsRes.data) {
    for (const row of statsRes.data) {
      const cid = String(row.conversation_id)
      unreadCountMap.set(cid, Number(row.unread_count) || 0)
      if (row.last_body != null && row.last_created_at != null && row.last_sender_id != null) {
        latestByConv.set(cid, {
          body: String(row.last_body),
          created_at: String(row.last_created_at),
          sender_id: String(row.last_sender_id),
        })
      }
    }
    return { latestByConv, unreadCountMap }
  }

  if (statsRes.error) {
    console.warn("[chat] inbox stats rpc unavailable, using client fallback:", statsRes.error.message)
  }

  const [readsRes, latestMsgsRes, otherMsgsRes] = await Promise.all([
    client
      .from("conversation_reads")
      .select("conversation_id, last_read_at")
      .eq("user_id", userId)
      .in("conversation_id", convIds),
    client
      .from("messages")
      .select("conversation_id, body, created_at, sender_id")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false }),
    client
      .from("messages")
      .select("conversation_id, created_at")
      .in("conversation_id", convIds)
      .neq("sender_id", userId),
  ])

  const readMap = new Map<string, string>()
  for (const r of readsRes.data ?? []) {
    readMap.set(String(r.conversation_id), String(r.last_read_at))
  }

  for (const m of latestMsgsRes.data ?? []) {
    const cid = String(m.conversation_id)
    if (!latestByConv.has(cid)) {
      latestByConv.set(cid, {
        body: String(m.body),
        created_at: String(m.created_at),
        sender_id: String(m.sender_id),
      })
    }
  }

  for (const m of otherMsgsRes.data ?? []) {
    const cid = String(m.conversation_id)
    const lastReadAt = readMap.get(cid)
    if (lastReadAt && new Date(String(m.created_at)) <= new Date(lastReadAt)) continue
    unreadCountMap.set(cid, (unreadCountMap.get(cid) ?? 0) + 1)
  }

  return { latestByConv, unreadCountMap }
}

export async function fetchConversations(client: SupabaseClient): Promise<ChatConversation[]> {
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser()
  if (userErr || !user) return []

  const { data: rows, error } = await client
    .from("conversations")
    .select(
      "id, participant_low, participant_high, last_message_at, job_application_id, service_inquiry_id, job_applications(job_id, jobs(title)), service_inquiries(services(title))",
    )
    .or(`participant_low.eq.${user.id},participant_high.eq.${user.id}`)
    .order("last_message_at", { ascending: false, nullsFirst: false })

  if (error) {
    console.warn("[chat] fetch conversations:", error.message)
    return []
  }

  const convRows = rows ?? []
  if (convRows.length === 0) return []

  const otherIds = convRows.map((c) =>
    otherParticipantId(c as { participant_low: string; participant_high: string }, user.id),
  )

  const convIds = convRows.map((c) => String((c as { id: string }).id))

  const [profilesRes, { latestByConv, unreadCountMap }] = await Promise.all([
    client.from("profiles").select("id, full_name, avatar_url").in("id", otherIds),
    fetchInboxMessageStats(client, convIds, user.id),
  ])

  const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()
  for (const p of profilesRes.data ?? []) {
    profileMap.set(String(p.id), { full_name: p.full_name, avatar_url: p.avatar_url })
  }

  return convRows.map((raw) => {
    const c = raw as unknown as {
      id: string
      participant_low: string
      participant_high: string
      last_message_at: string | null
      job_application_id: string | null
      service_inquiry_id: string | null
      job_applications:
        | { job_id: string; jobs: { title: string | null } | { title: string | null }[] | null }
        | { job_id: string; jobs: { title: string | null } | null }[]
        | null
      service_inquiries:
        | { services: { title: string | null } | { title: string | null }[] | null }
        | { services: { title: string | null } | null }[]
        | null
    }
    const otherId = otherParticipantId(c, user.id)
    const prof = profileMap.get(otherId)
    const latest = latestByConv.get(c.id)
    const lastActivity = latest?.created_at ?? c.last_message_at
    const unreadCount = unreadCountMap.get(c.id) ?? 0
    const unread = unreadCount > 0

    const jobApps = c.job_applications
    const jobRow = Array.isArray(jobApps) ? jobApps[0] : jobApps
    const jobsRel = jobRow?.jobs
    const jobsObj = Array.isArray(jobsRel) ? jobsRel[0] : jobsRel

    const inquiries = c.service_inquiries
    const inquiryRow = Array.isArray(inquiries) ? inquiries[0] : inquiries
    const servicesRel = inquiryRow?.services
    const servicesObj = Array.isArray(servicesRel) ? servicesRel[0] : servicesRel

    let contextLabel: string | null = null
    const jobTitle = jobsObj?.title?.trim()
    const listingTitle = servicesObj?.title?.trim()
    if (jobTitle) contextLabel = `სამუშაო: ${jobTitle}`
    else if (listingTitle) contextLabel = `სერვისი: ${listingTitle}`

    return {
      id: c.id,
      otherUserId: otherId,
      otherName: prof?.full_name?.trim() || "მომხმარებელი",
      otherAvatarUrl: prof?.avatar_url ?? null,
      lastMessagePreview: latest ? latest.body.replace(/\s+/g, " ").trim() : null,
      lastMessageAt: lastActivity,
      unread,
      unreadCount,
      contextLabel,
    }
  })
}

export async function fetchOtherParticipantLastReadAt(
  client: SupabaseClient,
  conversationId: string,
  meId: string,
): Promise<string | null> {
  const convId = requireConversationId(conversationId)
  const { data: conv, error: convErr } = await client
    .from("conversations")
    .select("participant_low, participant_high")
    .eq("id", convId)
    .maybeSingle()
  if (convErr || !conv) return null

  const otherId = otherParticipantId(
    conv as { participant_low: string; participant_high: string },
    meId,
  )
  const { data: readRow, error: readErr } = await client
    .from("conversation_reads")
    .select("last_read_at")
    .eq("conversation_id", convId)
    .eq("user_id", otherId)
    .maybeSingle()
  if (readErr) {
    console.warn("[chat] fetch other read:", readErr.message)
    return null
  }
  return readRow?.last_read_at != null ? String(readRow.last_read_at) : null
}

export async function fetchMessages(
  client: SupabaseClient,
  conversationId: string,
): Promise<{ messages: ChatMessage[]; meId: string; otherLastReadAt: string | null }> {
  const convId = requireConversationId(conversationId)
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser()
  if (userErr || !user) return { messages: [], meId: "", otherLastReadAt: null }

  const [messagesRes, otherLastReadAt] = await Promise.all([
    client
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(200),
    fetchOtherParticipantLastReadAt(client, convId, user.id),
  ])

  if (messagesRes.error) throw messagesRes.error

  const messages = (messagesRes.data ?? []).map((row) => {
    const createdAt = String(row.created_at)
    const isOwn = String(row.sender_id) === user.id
    return {
      id: String(row.id),
      conversationId: String(row.conversation_id),
      senderId: String(row.sender_id),
      body: String(row.body),
      createdAt,
      isOwn,
      readByOther: isOwn && isMessageReadByOther(createdAt, otherLastReadAt),
    }
  })

  return { messages, meId: user.id, otherLastReadAt }
}

export async function sendMessage(client: SupabaseClient, conversationId: string, body: string): Promise<ChatMessage> {
  const convId = requireConversationId(conversationId)
  const trimmed = assertField(
    validateTextField(body, {
      min: LIMITS.chatMessageMin,
      max: LIMITS.chatMessage,
      label: "შეტყობინება",
    }),
  )

  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser()
  if (userErr || !user) throw new Error("Not authenticated")

  const { data, error } = await client
    .from("messages")
    .insert({
      conversation_id: convId,
      sender_id: user.id,
      body: trimmed,
    })
    .select("id, conversation_id, sender_id, body, created_at")
    .single()

  if (error) throw error

  const createdAt = String(data.created_at)
  return {
    id: String(data.id),
    conversationId: String(data.conversation_id),
    senderId: String(data.sender_id),
    body: String(data.body),
    createdAt,
    isOwn: true,
    readByOther: false,
  }
}

export async function fetchUnreadConversationCount(client: SupabaseClient): Promise<number> {
  const list = await fetchConversations(client)
  return list.reduce((sum, c) => sum + c.unreadCount, 0)
}

export function applyReadReceipts(messages: ChatMessage[], otherLastReadAt: string | null): ChatMessage[] {
  return messages.map((m) =>
    m.isOwn
      ? { ...m, readByOther: isMessageReadByOther(m.createdAt, otherLastReadAt) }
      : m,
  )
}

export async function markConversationRead(client: SupabaseClient, conversationId: string): Promise<void> {
  const convId = requireConversationId(conversationId)
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser()
  if (userErr || !user) return

  const { error } = await client.from("conversation_reads").upsert(
    {
      conversation_id: convId,
      user_id: user.id,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,user_id" },
  )

  if (error) console.warn("[chat] mark read:", error.message)
}

export function resolveAvatarSrc(client: SupabaseClient, url: string | null): string | null {
  if (!url) return null
  return avatarImageUrl(client, url) ?? url
}
