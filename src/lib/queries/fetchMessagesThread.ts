import { fetchMessages, type ChatMessage } from "../chat.ts"
import { isSupabaseConfigured, supabase } from "../supabase.ts"

export type MessagesThreadData = {
  messages: ChatMessage[]
  meId: string
  otherLastReadAt: string | null
}

export async function fetchMessagesThread(conversationId: string): Promise<MessagesThreadData> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase არ არის კონფიგურირებული.")
  }
  const { messages, meId, otherLastReadAt } = await fetchMessages(supabase, conversationId)
  return { messages, meId, otherLastReadAt }
}
