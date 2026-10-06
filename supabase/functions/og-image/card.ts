/**
 * 1200×630 link-preview cards rendered by satori. Pure functions (no Deno/npm imports) so the
 * layout can be test-rendered under Node as well.
 */

export type ShareMeta = {
  kind: "freelancer" | "job" | "listing"
  name?: string | null
  title?: string | null
  bio?: string | null
  description?: string | null
  city?: string | null
  rating?: number | null
  reviews?: number | null
  completed?: number | null
  skills?: string[] | null
  budget_type?: string | null
  budget_min?: number | null
  budget_max?: number | null
  location_type?: string | null
  company?: string | null
  price?: number | null
  price_type?: string | null
  is_beginner_friendly?: boolean | null
  is_internship?: boolean | null
}

type Style = Record<string, string | number>
export type CardNode = { type: string; props: { style?: Style; children?: unknown; src?: string; width?: number; height?: number } }

const BLUE = "#0088FF"
const NAVY = "#1B2B4B"
const GOLD = "#F7CE50"
const MUTED = "#64748B"

function h(type: string, style: Style, children?: unknown): CardNode {
  return { type, props: { style: { display: "flex", ...style }, children } }
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "H"
  )
}

const PERIOD: Record<string, string> = { hourly: "/საათი", monthly: "/თვე" }

function money(value: number): string {
  return `${Math.round(value).toLocaleString("en-US").replace(/,/g, " ")} ₾`
}

function budgetText(meta: ShareMeta): string | null {
  const min = meta.budget_min ?? meta.budget_max
  const max = meta.budget_max ?? meta.budget_min
  const period = PERIOD[meta.budget_type ?? ""] ?? ""
  if (min == null || max == null) return null
  if (min !== max && !period) return `${money(min)} – ${money(max)}`
  return `${money(min)}${period}`
}

const LOCATION_LABELS: Record<string, string> = {
  remote: "დისტანციური",
  hybrid: "ჰიბრიდული",
  tbilisi: "თბილისი",
  anywhere: "ნებისმიერი ადგილი",
}

function cityLabel(city: string | null | undefined): string | null {
  if (!city || city.startsWith("__")) return null
  return city
}

function pill(text: string, background: string, color: string): CardNode {
  return h(
    "div",
    { background, color, borderRadius: 999, padding: "8px 22px", fontSize: 26, fontWeight: 700, marginRight: 14 },
    text,
  )
}

function brandFooter(cta: string): CardNode {
  return h(
    "div",
    {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 96,
      background: BLUE,
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 64px",
    },
    [
      h("div", { color: GOLD, fontSize: 44, fontWeight: 700 }, "ჰირა"),
      h("div", { color: "#FFFFFF", fontSize: 30, fontWeight: 700 }, `${cta}  ·  hira.ge`),
    ],
  )
}

function shell(children: CardNode[], cta: string): CardNode {
  return h(
    "div",
    {
      width: 1200,
      height: 630,
      position: "relative",
      flexDirection: "column",
      background: "#FFFFFF",
      fontFamily: "Noto Sans Georgian",
      padding: "64px 64px 140px",
    },
    [...children, brandFooter(cta)],
  )
}

function statsLine(meta: ShareMeta): string {
  const parts: string[] = []
  const city = cityLabel(meta.city)
  if (city) parts.push(city)
  if ((meta.reviews ?? 0) > 0 && meta.rating) parts.push(`რეიტინგი ${Number(meta.rating).toFixed(1)}/5 (${meta.reviews})`)
  if ((meta.completed ?? 0) > 0) parts.push(`${meta.completed} შესრულებული სამუშაო`)
  return parts.join("  ·  ")
}

function freelancerCard(meta: ShareMeta, avatarDataUri: string | null): CardNode {
  const name = truncate(meta.name ?? "ფრილანსერი", 40)
  const avatar = avatarDataUri
    ? { type: "img", props: { src: avatarDataUri, width: 220, height: 220, style: { borderRadius: 999, objectFit: "cover" } } }
    : h(
        "div",
        {
          width: 220,
          height: 220,
          borderRadius: 999,
          background: NAVY,
          color: "#FFFFFF",
          fontSize: 88,
          fontWeight: 700,
          alignItems: "center",
          justifyContent: "center",
        },
        initials(name),
      )

  const skills = (meta.skills ?? []).slice(0, 4)
  return shell(
    [
      h("div", { alignItems: "center" }, [
        avatar,
        h("div", { flexDirection: "column", marginLeft: 56, flex: 1 }, [
          h("div", { fontSize: 64, fontWeight: 700, color: NAVY, lineHeight: 1.1 }, name),
          meta.title ? h("div", { fontSize: 36, color: MUTED, marginTop: 14 }, truncate(meta.title, 60)) : h("div", {}, ""),
          h("div", { fontSize: 28, color: NAVY, marginTop: 22 }, statsLine(meta)),
        ]),
      ]),
      h(
        "div",
        { marginTop: 44, flexWrap: "wrap" },
        skills.map((skill) => pill(truncate(skill, 24), "#E8F4FF", BLUE)),
      ),
    ],
    "დამიქირავე ჰირაზე",
  )
}

function jobCard(meta: ShareMeta): CardNode {
  const tags: CardNode[] = [pill("სამუშაო", BLUE, "#FFFFFF")]
  if (meta.is_internship) tags.push(pill("სტაჟირება", GOLD, NAVY))
  if (meta.is_beginner_friendly) tags.push(pill("დამწყებთათვის", "#DCFCE7", "#166534"))

  const details = [
    budgetText(meta),
    LOCATION_LABELS[meta.location_type ?? ""] ?? cityLabel(meta.city),
    meta.company ? truncate(meta.company, 40) : null,
  ].filter(Boolean) as string[]

  return shell(
    [
      h("div", {}, tags),
      h("div", { fontSize: 60, fontWeight: 700, color: NAVY, marginTop: 34, lineHeight: 1.15 }, truncate(meta.title ?? "", 90)),
      h("div", { fontSize: 32, color: MUTED, marginTop: 28 }, details.join("  ·  ")),
    ],
    "გამოეხმაურე ჰირაზე",
  )
}

function listingCard(meta: ShareMeta): CardNode {
  const price =
    meta.price && meta.price > 0 ? `${money(meta.price)}${PERIOD[meta.price_type ?? ""] ?? ""}` : "ფასი შეთანხმებით"
  const by = [meta.name ? truncate(meta.name, 40) : null, cityLabel(meta.city)].filter(Boolean).join("  ·  ")
  return shell(
    [
      h("div", {}, [pill("სერვისი", NAVY, "#FFFFFF")]),
      h("div", { fontSize: 60, fontWeight: 700, color: NAVY, marginTop: 34, lineHeight: 1.15 }, truncate(meta.title ?? "", 90)),
      h("div", { fontSize: 40, fontWeight: 700, color: BLUE, marginTop: 28 }, price),
      by ? h("div", { fontSize: 30, color: MUTED, marginTop: 14 }, by) : h("div", {}, ""),
    ],
    "შეუკვეთე ჰირაზე",
  )
}

export function buildCard(meta: ShareMeta, avatarDataUri: string | null): CardNode {
  if (meta.kind === "freelancer") return freelancerCard(meta, avatarDataUri)
  if (meta.kind === "job") return jobCard(meta)
  return listingCard(meta)
}
