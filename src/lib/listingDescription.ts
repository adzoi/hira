const LEGACY_PRICE_PREFIX_RE = /^\s*\[\s*ფასი\s*:\s*(?:შეთანხმებით|საათობრივი)\s*]\s*/i

export const META_PREFIX = "<!--hira-meta:"
const LEGACY_META_PREFIX = "<!--gigori-meta:"
export const META_SUFFIX = "-->"

/** Resolve listing description meta prefix (supports legacy gigori-meta blocks). */
export function resolveListingMetaPrefix(raw: string): string | null {
  if (raw.startsWith(META_PREFIX)) return META_PREFIX
  if (raw.startsWith(LEGACY_META_PREFIX)) return LEGACY_META_PREFIX
  return null
}

/** Remove legacy "[ფასი: ...]" prefix saved into service description text. */
export function stripLegacyPricePrefix(text: string | null | undefined): string {
  return String(text ?? "").replace(LEGACY_PRICE_PREFIX_RE, "").trimStart()
}

/** Parse optional Hira JSON meta block and return visible one-line preview + tags (same rules as home feed). */
export function parseListingPreview(raw: string | null): { text: string; tags: string[] } {
  if (!raw) return { text: "", tags: [] }
  const fallbackTags: string[] = []
  let body = raw
  const metaPrefix = resolveListingMetaPrefix(raw)
  if (metaPrefix) {
    const endIndex = raw.indexOf(META_SUFFIX)
    if (endIndex >= 0) {
      const metaChunk = raw.slice(metaPrefix.length, endIndex).trim()
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

