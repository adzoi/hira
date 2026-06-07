const seen = new Map<string, number>()
const TTL_MS = 60_000

/** Run at most once per message id (broadcast + postgres often fire together). */
export function oncePerChatMessage(messageId: string, fn: () => void): void {
  const id = messageId.trim()
  if (!id) return
  const now = Date.now()
  for (const [key, at] of seen) {
    if (now - at > TTL_MS) seen.delete(key)
  }
  if (seen.has(id)) return
  seen.set(id, now)
  fn()
}
