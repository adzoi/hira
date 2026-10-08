import { PROFILE_LANGUAGE_OPTIONS, PROFILE_LANGUAGE_SEARCH_TERMS } from "./profileLanguages.ts"
import type { FreelancerEducationDegreeLevel } from "./freelancerEducation.ts"

/**
 * Pre-fill a freelancer profile from an uploaded CV (PDF), entirely in the browser.
 * Text comes from pdf.js; the parser is heuristic (section headings in ka/en/ru, date ranges,
 * known skills and languages), so the UI always shows the result for review before applying.
 */

export type CvImportExperience = {
  title: string
  organization: string
  /** YYYY-MM-DD (first of the month). */
  startDate: string
  endDate: string
  isPresent: boolean
  description: string
}

export type CvImportEducation = {
  institution: string
  degreeLevel: FreelancerEducationDegreeLevel | ""
  fieldOfStudy: string
  endDate: string
}

export type CvImportLinks = {
  linkedin: string
  github: string
  portfolio: string
  facebook: string
  instagram: string
  tiktok: string
  youtube: string
  x: string
}

export type CvImportResult = {
  fullName: string
  title: string
  bio: string
  email: string
  phone: string
  skillIds: string[]
  languages: string[]
  links: CvImportLinks
  experiences: CvImportExperience[]
  educations: CvImportEducation[]
  /** Characters of text found; ~0 means a scanned (image-only) PDF. */
  textLength: number
}

// ── PDF → lines ─────────────────────────────────────────────────────────────

type TextItem = { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }
type PlacedItem = { x: number; y: number; w: number; h: number; str: string }

export type PdfText = { lines: string[]; links: string[] }

/**
 * x where a page splits into two columns (sidebar CVs from Canva etc.), or null.
 * A split is an empty vertical strip in the middle of the page with real text on both sides,
 * so right-aligned dates in a one-column CV do not count as a second column.
 */
function columnSplit(items: PlacedItem[], pageWidth: number): number | null {
  if (items.length < 12) return null
  const spans = items.map((it) => [it.x, it.x + Math.max(it.w, 1)] as const).sort((a, b) => a[0] - b[0])
  const totalChars = items.reduce((n, it) => n + it.str.length, 0)
  let best: { at: number; width: number } | null = null
  let reach = -Infinity
  for (const [x0, x1] of spans) {
    const gap = x0 - reach
    const mid = reach + gap / 2
    if (reach > -Infinity && gap >= 12 && mid > pageWidth * 0.2 && mid < pageWidth * 0.75) {
      const leftChars = items.filter((it) => it.x < mid).reduce((n, it) => n + it.str.length, 0)
      const rightChars = totalChars - leftChars
      if (leftChars >= totalChars * 0.15 && rightChars >= totalChars * 0.15 && (!best || gap > best.width)) best = { at: mid, width: gap }
    }
    reach = Math.max(reach, x1)
  }
  return best?.at ?? null
}

/** Group items into rows by baseline (y), then each row left to right; wide gaps become separate lines. */
function itemsToLines(items: PlacedItem[]): string[] {
  const lines: string[] = []
  const rows: Array<{ y: number; parts: PlacedItem[] }> = []
  for (const it of items) {
    const tol = Math.max(2, (it.h || 10) * 0.4)
    let row = rows.find((r) => Math.abs(r.y - it.y) <= tol)
    if (!row) {
      row = { y: it.y, parts: [] }
      rows.push(row)
    }
    row.parts.push(it)
  }
  rows.sort((a, b) => b.y - a.y)
  for (const row of rows) {
    row.parts.sort((a, b) => a.x - b.x)
    let current = ""
    let lastEnd = -Infinity
    for (const part of row.parts) {
      const gap = part.x - lastEnd
      if (current && gap > 60) {
        lines.push(current.replace(/\s+/g, " ").trim())
        current = ""
      } else if (current && gap > 1.5 && !current.endsWith(" ") && !part.str.startsWith(" ")) {
        current += " "
      }
      current += part.str
      lastEnd = part.x + part.w
    }
    if (current.trim()) lines.push(current.replace(/\s+/g, " ").trim())
  }
  return lines
}

/** Extracts text lines top-to-bottom per page (column by column on two-column pages), plus link targets. */
export async function extractPdfLines(file: File): Promise<PdfText> {
  const pdfjs = await import("pdfjs-dist")
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  const lines: string[] = []
  const links: string[] = []
  const pageCount = Math.min(doc.numPages, 8)
  for (let p = 1; p <= pageCount; p += 1) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const items: PlacedItem[] = (content.items as unknown[])
      .filter((it): it is TextItem => typeof (it as TextItem).str === "string" && Array.isArray((it as TextItem).transform))
      .filter((it) => it.str.trim())
      .map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width, h: it.height, str: it.str }))
    const split = columnSplit(items, page.view[2] - page.view[0])
    if (split == null) lines.push(...itemsToLines(items))
    else {
      lines.push(...itemsToLines(items.filter((it) => it.x < split)), "")
      lines.push(...itemsToLines(items.filter((it) => it.x >= split)))
    }
    lines.push("")
    // "LinkedIn" / "GitHub" are often clickable words or icons whose URL never appears as text.
    try {
      const annotations = (await page.getAnnotations()) as Array<{ url?: unknown }>
      for (const a of annotations) if (typeof a.url === "string" && /^https?:\/\//i.test(a.url)) links.push(a.url)
    } catch {
      /* annotations are a bonus */
    }
  }
  await doc.destroy()
  return { lines, links }
}

// ── Text → fields ───────────────────────────────────────────────────────────

type SectionKey = "summary" | "experience" | "education" | "skills" | "languages" | "contact" | "other"

const SECTION_PATTERNS: Array<[SectionKey, RegExp]> = [
  ["summary", /^(summary|professional summary|profile|about( me)?|objective|career objective|შესახებ|ჩემ(ს)? შესახებ|პროფილი|რეზიუმე|მოკლე აღწერა|о себе|профиль|резюме)$/],
  ["experience", /^(work experience|experience|professional experience|employment( history)?|work history|career history|სამუშაო გამოცდილება|გამოცდილება|პროფესიული გამოცდილება|опыт работы|опыт)$/],
  ["education", /^(education|academic background|education and training|განათლება|სწავლა|образование)$/],
  ["skills", /^(skills|technical skills|key skills|core skills|hard skills|soft skills|competencies|tools|technologies|უნარები|უნარ-ჩვევები|ტექნიკური უნარები|კომპეტენციები|навыки|ключевые навыки)$/],
  ["languages", /^(languages?|language skills|ენები|ენის ცოდნა|языки|знание языков)$/],
  ["contact", /^(contacts?|contact info(rmation)?|personal (info|details|information)|საკონტაქტო( ინფორმაცია)?|კონტაქტი|контакты)$/],
  ["other", /^(certificates?|certifications?|courses|trainings?|projects|awards|achievements|interests|hobbies|references|volunteering|publications|სერტიფიკატები|კურსები|ტრენინგები|პროექტები|ჯილდოები|ინტერესები|хобби|сертификаты|проекты)$/],
]

// Same patterns without spaces, for letter-spaced headings ("E X P E R I E N C E").
const COMPACT_SECTION_PATTERNS: Array<[SectionKey, RegExp]> = SECTION_PATTERNS.map(([key, re]) => [key, new RegExp(re.source.replace(/ /g, ""))])

function sectionOf(line: string): SectionKey | null {
  const norm = line
    .toLowerCase()
    .replace(/[:•|·\-–—_*#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!norm || norm.length > 40) return null
  for (const [key, re] of SECTION_PATTERNS) if (re.test(norm)) return key
  const tokens = norm.split(" ")
  if (tokens.length >= 3 && tokens.filter((t) => t.length === 1).length >= tokens.length * 0.7) {
    const compact = tokens.join("")
    for (const [key, re] of COMPACT_SECTION_PATTERNS) if (re.test(compact)) return key
  }
  return null
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE_RE = /(?:\+?995[\s-]?)?(?:\(?5\d{2}\)?[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}|\+\d[\d\s-]{7,14}\d)/
const URL_RE = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s,;)]*)?)/gi

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
  იანვარი: 1, თებერვალი: 2, მარტი: 3, აპრილი: 4, მაისი: 5, ივნისი: 6, ივლისი: 7, აგვისტო: 8,
  სექტემბერი: 9, ოქტომბერი: 10, ნოემბერი: 11, დეკემბერი: 12,
  янв: 1, январь: 1, фев: 2, февраль: 2, мар: 3, март: 3, апр: 4, апрель: 4, май: 5, июн: 6, июнь: 6,
  июл: 7, июль: 7, авг: 8, август: 8, сен: 9, сентябрь: 9, окт: 10, октябрь: 10, ноя: 11, ноябрь: 11, дек: 12, декабрь: 12,
}

const PRESENT_RE = /^(present|current|now|today|ongoing|till now|to date|დღემდე|ამჟამად|მიმდინარე|настоящее время|н\.?\s?в\.?|по настоящее время|сейчас)$/i
const DATE_TOKEN = String.raw`(?:(?:[A-Za-zა-ჰА-Яа-я]{3,10}\.?\s+\d{4})|(?:\d{1,2}[./-]\d{4})|(?:\d{4}[./-]\d{1,2})|(?:\d{4}))`
const PRESENT_TOKEN = String.raw`(?:present|current|now|today|ongoing|to date|დღემდე|ამჟამად|მიმდინარე|настоящее время|по настоящее время|н\.?\s?в\.?|сейчас)`
const RANGE_RE = new RegExp(`(${DATE_TOKEN})\\s*(?:-|–|—|to|until|till|\\bდან\\b|-დან|по|до)\\s*(${DATE_TOKEN}|${PRESENT_TOKEN})`, "i")

function pad(n: number) {
  return String(n).padStart(2, "0")
}

/** "Mar 2021", "03/2021", "2021-03", "2021" → "2021-03-01"; null if it does not look like a date. */
function parseDateToken(raw: string): string | null {
  const s = raw.trim().replace(/\.$/, "")
  let m = s.match(/^([A-Za-zა-ჰА-Яа-я]{3,10})\.?\s+(\d{4})$/)
  if (m) {
    const month = MONTHS[m[1].toLowerCase()] ?? MONTHS[m[1].toLowerCase().slice(0, 3)]
    const year = Number(m[2])
    if (month && year > 1950 && year < 2100) return `${year}-${pad(month)}-01`
    return null
  }
  m = s.match(/^(\d{1,2})[./-](\d{4})$/)
  if (m) {
    const month = Number(m[1])
    const year = Number(m[2])
    if (month >= 1 && month <= 12 && year > 1950 && year < 2100) return `${year}-${pad(month)}-01`
    return null
  }
  m = s.match(/^(\d{4})[./-](\d{1,2})$/)
  if (m) {
    const year = Number(m[1])
    const month = Number(m[2])
    if (month >= 1 && month <= 12 && year > 1950 && year < 2100) return `${year}-${pad(month)}-01`
    return null
  }
  m = s.match(/^(\d{4})$/)
  if (m) {
    const year = Number(m[1])
    if (year > 1950 && year < 2100) return `${year}-01-01`
  }
  return null
}

function findRange(line: string): { start: string; end: string; isPresent: boolean; index: number; length: number } | null {
  const m = line.match(RANGE_RE)
  if (!m || m.index == null) return null
  const start = parseDateToken(m[1])
  if (!start) return null
  const endRaw = m[2].trim()
  if (PRESENT_RE.test(endRaw)) return { start, end: "", isPresent: true, index: m.index, length: m[0].length }
  const end = parseDateToken(endRaw)
  if (!end || end < start) return null
  return { start, end, isPresent: false, index: m.index, length: m[0].length }
}

function stripRange(line: string, r: { index: number; length: number }): string {
  return (line.slice(0, r.index) + " " + line.slice(r.index + r.length))
    .replace(/[|•·,()[\]]+\s*$/, "")
    .replace(/^\s*[|•·,()[\]]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

/** "Designer at Acme", "Designer — Acme", "Designer, Acme", "Designer | Acme". */
function splitRoleCompany(text: string): { title: string; organization: string } {
  const t = text.trim()
  const at = t.match(/^(.+?)\s+(?:at|@|в|-ში)\s+(.+)$/i)
  if (at) return { title: at[1].trim(), organization: at[2].trim() }
  const sep = t.split(/\s+[|–—-]\s+|\s*,\s+/)
  if (sep.length >= 2) return { title: sep[0].trim(), organization: sep.slice(1).join(", ").trim() }
  return { title: t, organization: "" }
}

const BULLET_RE = /^[•▪●◦\-–*·]\s*/

function isContactLine(line: string): boolean {
  return EMAIL_RE.test(line) || PHONE_RE.test(line) || /linkedin|github|facebook|instagram|http|www\./i.test(line)
}

function parseExperience(lines: string[]): CvImportExperience[] {
  const out: CvImportExperience[] = []
  let current: CvImportExperience | null = null
  let pendingHeader: string[] = []
  const appendDescription = (job: CvImportExperience, text: string) => {
    job.description += (job.description ? "\n" : "") + text.replace(BULLET_RE, "• ")
  }
  // Keep at most two header candidates; an older one was a bullet of the current job, not a header.
  const addPending = (line: string) => {
    if (current && pendingHeader.length >= 2) appendDescription(current, pendingHeader.shift() as string)
    pendingHeader.push(line)
  }
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean)
  for (let i = 0; i < nonEmpty.length; i += 1) {
    const line = nonEmpty[i]
    const range = findRange(line)
    if (range) {
      const rest = stripRange(line, range)
      // "Title + date" on one row with the company on the next line: only the line right before the
      // date is a header, the one above it is the previous job's last bullet.
      const next = nonEmpty[i + 1] ?? ""
      if (current && !rest && pendingHeader.length === 2 && next && !BULLET_RE.test(next) && !findRange(next) && next.length < 60 && !/[.;:]$/.test(next)) {
        appendDescription(current, pendingHeader.shift() as string)
      }
      if (current) out.push(current)
      // Header text can sit on the date line, on the line(s) just before it, or both.
      const headerParts = [...pendingHeader, rest].filter(Boolean)
      let title = ""
      let organization = ""
      if (headerParts.length >= 2) {
        const first = splitRoleCompany(headerParts[0])
        title = first.title
        organization = first.organization || headerParts[1]
      } else if (headerParts.length === 1) {
        const one = splitRoleCompany(headerParts[0])
        title = one.title
        organization = one.organization
      }
      current = { title, organization, startDate: range.start, endDate: range.end, isPresent: range.isPresent, description: "" }
      pendingHeader = []
      continue
    }
    if (!current) {
      pendingHeader = [...pendingHeader, line].slice(-2)
      continue
    }
    // A title wrapped onto two lines ("Web Developer &" / "Website Manager").
    if (!current.description && current.title && !current.organization && /(&|\band|,|\/|-)$/i.test(current.title)) {
      current.title = `${current.title} ${line}`
      continue
    }
    // A line starting in lowercase continues the previous bullet, it is never a new job's header.
    if (current.description && /^\p{Ll}/u.test(line)) {
      if (pendingHeader.length) pendingHeader[pendingHeader.length - 1] += ` ${line}`
      else current.description += ` ${line}`
      continue
    }
    // Before any description, a short non-bullet line is most likely the company (or the role).
    if (!current.description && !BULLET_RE.test(line) && line.length < 70) {
      if (!current.organization) {
        current.organization = line
        continue
      }
      if (!current.title) {
        current.title = line
        continue
      }
    }
    // A short header-looking line followed later by a date belongs to the next job.
    if (!BULLET_RE.test(line) && line.length < 60 && !/[.;:]$/.test(line) && current.description) {
      addPending(line)
      continue
    }
    for (const pending of pendingHeader) appendDescription(current, pending)
    pendingHeader = []
    appendDescription(current, line)
  }
  if (current) {
    for (const pending of pendingHeader) appendDescription(current, pending)
    out.push(current)
  }
  return out
    .map((e) => ({ ...e, title: e.title.slice(0, 120), organization: e.organization.slice(0, 120), description: e.description.slice(0, 1500) }))
    .filter((e) => e.title || e.organization)
    .slice(0, 10)
}

const INSTITUTION_RE = /(university|universiteti|institute|college|school|academy|უნივერსიტეტ|ინსტიტუტ|კოლეჯ|სკოლ|აკადემი|სასწავლებელ|университет|институт|колледж|академи)/i

function degreeFrom(text: string): FreelancerEducationDegreeLevel | "" {
  const t = text.toLowerCase()
  if (/(ph\.?\s?d|doctor|დოქტორ|доктор|аспирант)/.test(t)) return "doctorate"
  if (/(master|m\.?sc|m\.?a\.|mba|მაგისტ|магистр)/.test(t)) return "master"
  if (/(bachelor|b\.?sc|b\.?a\.|ბაკალავრ|бакалавр)/.test(t)) return "bachelor"
  if (/(vocational|პროფესიულ|колледж|профессиональн)/.test(t)) return "vocational"
  if (/(diploma|დიპლომ|диплом|specialist|სპეციალისტ)/.test(t)) return "diploma"
  return ""
}

function parseEducation(lines: string[]): CvImportEducation[] {
  const blocks: string[][] = []
  let block: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (block.length) blocks.push(block)
      block = []
      continue
    }
    // A new institution line starts a new entry.
    if (INSTITUTION_RE.test(line) && block.some((l) => INSTITUTION_RE.test(l))) {
      blocks.push(block)
      block = []
    }
    block.push(line)
  }
  if (block.length) blocks.push(block)

  const out: CvImportEducation[] = []
  for (const b of blocks) {
    const text = b.join(" ")
    const institutionLine = b.find((l) => INSTITUTION_RE.test(l)) ?? ""
    if (!institutionLine) continue
    const range = findRange(text)
    const years = text.match(/\b(19[5-9]\d|20\d{2})\b/g) ?? []
    const endYear = range?.isPresent ? "" : range?.end?.slice(0, 4) ?? years[years.length - 1] ?? ""
    let institution = institutionLine
    const r = findRange(institution)
    if (r) institution = stripRange(institution, r)
    institution = institution.replace(/\b(19[5-9]\d|20\d{2})\b/g, "").replace(/[|•·,–—-]+\s*$/, "").trim()
    const fieldLine = b.find((l) => l !== institutionLine && !findRange(l) && l.length < 100) ?? ""
    const fieldOfStudy = fieldLine
      .replace(/^(bachelor|master|b\.?sc|m\.?sc|b\.?a\.?|m\.?a\.?|phd|ბაკალავრი(ატი)?|მაგისტრი|მაგისტრატურა|დოქტორანტურა|бакалавр|магистр)\s*(of|in|'s|’s)?\s*(science|arts)?\s*(in|of)?\s*[,:–—-]?\s*/i, "")
      .replace(/[|•·,–—-]+\s*$/, "")
      .trim()
    out.push({
      institution: institution.slice(0, 160),
      degreeLevel: degreeFrom(text),
      fieldOfStudy: fieldOfStudy.slice(0, 120),
      endDate: endYear ? `${endYear}-06-30` : "",
    })
  }
  return out.slice(0, 10)
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function matchSkills(text: string, catalog: Array<{ id: string; name: string }>): string[] {
  const original = ` ${text.replace(/\s+/g, " ")} `
  const lower = original.toLowerCase()
  const found: Array<{ id: string; pos: number }> = []
  for (const skill of catalog) {
    const name = skill.name.trim()
    if (name.length < 1) continue
    const short = name.length <= 3
    // Word-ish boundaries that also work for "C++", "Node.js" and Georgian suffixes ("Figma-ში").
    const pattern = `(^|[\\s,;/(|•·])${escapeRegExp(short ? name : name.toLowerCase())}(?=$|[\\s,;/)|•·.:-])`
    // Short names ("Go", "R", "UI") must match their exact casing, or every "go" in prose would count.
    const m = short ? original.match(new RegExp(pattern)) : lower.match(new RegExp(pattern, "i"))
    if (m && m.index != null) found.push({ id: skill.id, pos: m.index })
  }
  return found.sort((a, b) => a.pos - b.pos).map((f) => f.id).slice(0, 20)
}

function matchLanguages(text: string): string[] {
  const hay = text.toLowerCase()
  const out: string[] = []
  for (const option of PROFILE_LANGUAGE_OPTIONS) {
    const terms = [option.toLowerCase(), ...(PROFILE_LANGUAGE_SEARCH_TERMS[option] ?? [])]
      .map((t) => t.trim())
      .filter((t) => t.length >= 4)
    if (terms.some((term) => new RegExp(`(^|[^\\p{L}])${escapeRegExp(term)}`, "iu").test(hay))) out.push(option)
  }
  return out
}

function classifyLinks(text: string): CvImportLinks {
  const links: CvImportLinks = { linkedin: "", github: "", portfolio: "", facebook: "", instagram: "", tiktok: "", youtube: "", x: "" }
  const urls = text.match(URL_RE) ?? []
  for (const rawUrl of urls) {
    if (EMAIL_RE.test(rawUrl) || /@/.test(rawUrl)) continue
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl.replace(/^www\./i, "www.")}`
    const host = url.replace(/^https?:\/\/(www\.)?/i, "").toLowerCase()
    if (host.startsWith("linkedin.com/")) links.linkedin ||= url
    else if (host.startsWith("github.com/")) links.github ||= url
    else if (host.startsWith("facebook.com/") || host.startsWith("fb.com/")) links.facebook ||= url
    else if (host.startsWith("instagram.com/")) links.instagram ||= url
    else if (host.startsWith("tiktok.com/")) links.tiktok ||= url
    else if (host.startsWith("youtube.com/") || host.startsWith("youtu.be/")) links.youtube ||= url
    else if (host.startsWith("x.com/") || host.startsWith("twitter.com/")) links.x ||= url
    else if (/^(behance\.net|dribbble\.com|[a-z0-9-]+\.(dev|io|me|ge|com|net|org|site|design|portfolio))\b/.test(host) && !/(gmail|yahoo|outlook|mail)\./.test(host)) {
      // Only take bare domains / paths that look like a personal site, not e.g. a former employer.
      if (/^(behance\.net|dribbble\.com)/.test(host) || /^[a-z0-9-]+\.[a-z]{2,}\/?$/.test(host)) links.portfolio ||= url
    }
  }
  return links
}

const NAME_RE = /^[\p{Lu}\p{Script=Georgian}][\p{L}'’.-]+(?:\s+[\p{Lu}\p{Script=Georgian}][\p{L}'’.-]+){1,3}$/u

export function parseCvLines(rawLines: string[], skillCatalog: Array<{ id: string; name: string }>, linkUrls: string[] = []): CvImportResult {
  const lines = rawLines.map((l) => l.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim())
  const fullText = lines.join("\n")

  const sections: Record<SectionKey | "intro", string[]> = {
    intro: [], summary: [], experience: [], education: [], skills: [], languages: [], contact: [], other: [],
  }
  let current: SectionKey | "intro" = "intro"
  for (const line of lines) {
    const s = sectionOf(line)
    if (s) {
      current = s
      continue
    }
    sections[current].push(line)
  }

  const introLines = sections.intro.filter(Boolean)
  let fullName = ""
  let title = ""
  for (let i = 0; i < Math.min(introLines.length, 6); i += 1) {
    const l = introLines[i]
    if (isContactLine(l)) continue
    if (!fullName && NAME_RE.test(l) && l.length <= 50) {
      fullName = l
      const next = introLines[i + 1]
      if (next && !isContactLine(next) && next.length <= 70 && !findRange(next) && !/[.!?]$/.test(next)) title = next
      break
    }
  }

  let bio = sections.summary.filter(Boolean).join(" ").trim()
  if (!bio) {
    // No "Summary" heading: use the longest prose-like paragraph from the top of the CV.
    const prose = introLines.filter((l) => !isContactLine(l) && l !== fullName && l !== title && l.length > 60)
    bio = prose.join(" ").trim()
  }
  bio = bio.replace(/\s+/g, " ").slice(0, 2000)

  const email = fullText.match(EMAIL_RE)?.[0] ?? ""
  const phone = (fullText.match(PHONE_RE)?.[0] ?? "").trim()

  const skillText = [sections.skills.join(", "), fullText].join("\n")
  const languageText = sections.languages.length ? sections.languages.join(" ") : fullText

  return {
    fullName,
    title: title.slice(0, 100),
    bio,
    email,
    phone,
    skillIds: matchSkills(skillText, skillCatalog),
    languages: matchLanguages(languageText),
    links: classifyLinks([...linkUrls, fullText].join("\n")),
    experiences: parseExperience(sections.experience),
    educations: parseEducation(sections.education),
    textLength: fullText.replace(/\s/g, "").length,
  }
}

export async function importCvFromPdf(file: File, skillCatalog: Array<{ id: string; name: string }>): Promise<CvImportResult> {
  const { lines, links } = await extractPdfLines(file)
  return parseCvLines(lines, skillCatalog, links)
}
