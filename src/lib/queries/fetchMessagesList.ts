import { fetchConversations, type ChatConversation } from "../chat.ts"
import { resolveProfilePublicHrefByIds } from "../follows.ts"
import { isSupabaseConfigured, supabase } from "../supabase.ts"

export type MessagesListData = {
  conversations: ChatConversation[]
  profileHrefs: Record<string, string>
}

export async function fetchMessagesList(): Promise<MessagesListData> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase არ არის კონფიგურირებული.")
  }
  const list = await fetchConversations(supabase)
  const hrefs = await resolveProfilePublicHrefByIds(list.map((c) => c.otherUserId))
  return { conversations: list, profileHrefs: hrefs }
}
