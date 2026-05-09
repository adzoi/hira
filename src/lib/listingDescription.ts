const LEGACY_PRICE_PREFIX_RE = /^\s*\[\s*ფასი\s*:\s*(?:შეთანხმებით|საათობრივი)\s*]\s*/i

const META_PREFIX = "<!--gigori-meta:"
const META_SUFFIX = "-->"

/** Remove legacy "[ფასი: ...]" prefix saved into service description text. */
export function stripLegacyPricePrefix(text: string | null | undefined): string {
  return String(text ?? "").replace(LEGACY_PRICE_PREFIX_RE, "").trimStart()
}

/** Parse optional gigori JSON meta block and return visible one-line preview + tags (same rules as home feed). */
export function parseListingPreview(raw: string | null): { text: string; tags: string[] } {
  if (!raw) return { text: "", tags: [] }
  const fallbackTags: string[] = []
  let body = raw
  if (raw.startsWith(META_PREFIX)) {
    const endIndex = raw.indexOf(META_SUFFIX)
    if (endIndex >= 0) {
      const metaChunk = raw.slice(META_PREFIX.length, endIndex).trim()
      body = raw.slice(endIndex + META_SUFFIX.length).trimStart()
      try {
        const parsed = JSON.parse(metaChunk) as { tags?: unknown }
        if (Array.isArray(parsed.tags)) {
          for (const t of parsed.tags) {
            const s = String(t).trim()
            if (s && fallbackTags.length < 20) fallbackTags.push(s)
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  const oneLine = stripLegacyPricePrefix(body).replace(/\s+/g, " ").trim()
  return { text: oneLine, tags: fallbackTags }
}

