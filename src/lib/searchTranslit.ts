/**
 * Script-agnostic search key for Georgian text.
 *
 * People often type Georgian in Latin letters ("dizaini", "logos gaketeba",
 * "programisti"). Both the query and the haystack are folded into the same
 * Latin key, merging letters that informal transliteration doesn't tell apart
 * (თ/ტ → t, კ/ქ/ყ → k, პ/ფ → p, ც/წ → ts, ჩ/ჭ → ch, ჯ/ჟ → j).
 *
 * Keep in sync with public.ka_search_key() in
 * supabase/migrations/20261008150000_latin_georgian_search.sql.
 */

const GEORGIAN_TO_KEY: Record<string, string> = {
  ა: "a", ბ: "b", გ: "g", დ: "d", ე: "e", ვ: "v", ზ: "z", თ: "t", ი: "i",
  კ: "k", ლ: "l", მ: "m", ნ: "n", ო: "o", პ: "p", ჟ: "j", რ: "r", ს: "s",
  ტ: "t", უ: "u", ფ: "p", ქ: "k", ღ: "gh", ყ: "k", შ: "sh", ჩ: "ch", ც: "ts",
  ძ: "dz", წ: "ts", ჭ: "ch", ხ: "kh", ჯ: "j", ჰ: "h",
}

function foldLatin(s: string): string {
  return s
    .replace(/['’`ʼ]/g, "")
    .replace(/tch/g, "ch")
    .replace(/ph/g, "p")
    .replace(/th/g, "t")
    .replace(/zh/g, "j")
    .replace(/c(?!h)/g, "ts")
    .replace(/x/g, "kh")
    .replace(/[qy]/g, "k")
    .replace(/w/g, "ts")
    .replace(/f/g, "p")
}

export function searchKey(text: string | null | undefined): string {
  if (!text) return ""
  // Latin rules run before Georgian letters are expanded, so digraphs
  // produced from Georgian (ch, ts, kh…) are never re-folded.
  const latinFolded = foldLatin(text.toLowerCase())
  let out = ""
  for (const ch of latinFolded) out += GEORGIAN_TO_KEY[ch] ?? ch
  return out.replace(/[^\p{L}\p{N}]+/gu, " ").trim()
}

/** True when `query` appears in any haystack, as typed or via the transliterated key. */
export function matchesSearch(query: string, ...haystacks: Array<string | null | undefined>): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const qKey = searchKey(q)
  return haystacks.some((h) => {
    if (!h) return false
    if (h.toLowerCase().includes(q)) return true
    return qKey.length > 0 && searchKey(h).includes(qKey)
  })
}
