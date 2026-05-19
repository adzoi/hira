import type { SupabaseClient } from "@supabase/supabase-js"
import { avatarImageUrl } from "./storageImageUrl.ts"
import { LIMITS, validateTextField, validateUuid } from "./validation.ts"

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

export async function getOrCreateConversation(
  client: SupabaseClient,
  otherUserId: string,
  opts?: { jobApplicationId?: string; serviceInquiryId?: string },
): Promise<string> {
  const otherResult = validateUuid(otherUserId, "მომხმარებელი")
  if (!otherResult.ok) throw new Error(otherResult.message)

  let jobApplicationId: string | null = null
  if (opts?.jobApplicationId) {
    const appResult = validateUuid(opts.jobApplicationId, "განცხადება")
    if (!appResult.ok) throw new Error(appResult.message)
    jobApplicationId = appResult.value
  }

  let serviceInquiryId: string | null = null
  if (opts?.serviceInquiryId) {
    const inquiryResult = validateUuid(opts.serviceInquiryId, "შეთავაზება")
    if (!inquiryResult.ok) throw new Error(inquiryResult.message)
    serviceInquiryId = inquiryResult.value
  }

  const { data, error } = await client.rpc("get_or_create_conversation", {
    p_other_user_id: otherResult.value,
    p_job_application_id: jobApplicationId,
    p_service_inquiry_id: serviceInquiryId,
  })
  if (error) throw error
  if (!data) throw new Error("Conversation could not be created")
  return String(data)
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

  const [profilesRes, readsRes, latestMsgsRes] = await Promise.all([
    client.from("profiles").select("id, full_name, avatar_url").in("id", otherIds),
    client.from("conversation_reads").select("conversation_id, last_read_at").eq("user_id", user.id).in("conversation_id", convIds),
    client
      .from("messages")
      .select("conversation_id, body, created_at, sender_id")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false }),
  ])

  const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()
  for (const p of profilesRes.data ?? []) {
    profileMap.set(String(p.id), { full_name: p.full_name, avatar_url: p.avatar_url })
  }

  const readMap = new Map<string, string>()
  for (const r of readsRes.data ?? []) {
    readMap.set(String(r.conversation_id), String(r.last_read_at))
  }

  const latestByConv = new Map<string, { body: string; created_at: string; sender_id: string }>()
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
    const lastReadAt = readMap.get(c.id)
    const lastActivity = latest?.created_at ?? c.last_message_at
    const unread =
      latest != null &&
      latest.sender_id !== user.id &&
      (!lastReadAt || new Date(latest.created_at) > new Date(lastReadAt))

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
      contextLabel,
    }
  })
}

export async function fetchOtherParticipantLastReadAt(
  client: SupabaseClient,
  conversationId: string,
  meId: string,
): Promise<string | null> {
  const { data: conv, error: convErr } = await client
    .from("conversations")
    .select("participant_low, participant_high")
    .eq("id", conversationId)
    .maybeSingle()
  if (convErr || !conv) return null

  const otherId = otherParticipantId(
    conv as { participant_low: string; participant_high: string },
    meId,
  )
  const { data: readRow, error: readErr } = await client
    .from("conversation_reads")
    .select("last_read_at")
    .eq("conversation_id", conversationId)
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
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser()
  if (userErr || !user) return { messages: [], meId: "", otherLastReadAt: null }

  const [messagesRes, otherLastReadAt] = await Promise.all([
    client
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200),
    fetchOtherParticipantLastReadAt(client, conversationId, user.id),
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
  const validated = validateTextField(body, {
    min: LIMITS.chatMessageMin,
    max: LIMITS.chatMessage,
    label: "შეტყობინება",
  })
  if (!validated.ok) throw new Error(validated.message)
  const trimmed = validated.value

  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser()
  if (userErr || !user) throw new Error("Not authenticated")

  const { data, error } = await client
    .from("messages")
    .insert({
      conversation_id: conversationId,
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
  return list.filter((c) => c.unread).length
}

export function applyReadReceipts(messages: ChatMessage[], otherLastReadAt: string | null): ChatMessage[] {
  return messages.map((m) =>
    m.isOwn
      ? { ...m, readByOther: isMessageReadByOther(m.createdAt, otherLastReadAt) }
      : m,
  )
}

export async function markConversationRead(client: SupabaseClient, conversationId: string): Promise<void> {
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser()
  if (userErr || !user) return

  const { error } = await client.from("conversation_reads").upsert(
    {
      conversation_id: conversationId,
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
