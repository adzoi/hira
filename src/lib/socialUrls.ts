function tryParseUrl(raw: string): URL | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    return new URL(withProto)
  } catch {
    return null
  }
}

function hostRoot(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase()
}

/** LinkedIn პროფილი / კომპანია — linkedin.com ქვედომენი. */
export function parseLinkedInField(raw: string): { ok: true; value: string | null } | { ok: false; message: string } {
  const t = raw.trim()
  if (!t) return { ok: true, value: null }
  const u = tryParseUrl(t)
  if (!u) return { ok: false, message: "LinkedIn: ბმული არასწორი ფორმატისაა." }
  const h = hostRoot(u.hostname)
  if (h !== "linkedin.com" && !h.endsWith(".linkedin.com")) {
    return { ok: false, message: "LinkedIn: მისამართი უნდა იყოს linkedin.com დომენზე." }
  }
  const path = u.pathname.replace(/\/+$/, "") || "/"
  if (
    path === "/" ||
    (!path.startsWith("/in/") &&
      !path.startsWith("/company/") &&
      !path.startsWith("/school/") &&
      !path.startsWith("/pub/"))
  ) {
    return { ok: false, message: "LinkedIn: გამოიყენე პროფილის ბმული (მაგ. …/in/… ან …/company/…)." }
  }
  return { ok: true, value: u.toString() }
}

/** GitHub — მომხმარებლის ან რეპოს გვერდი github.com ზე. */
export function parseGitHubField(raw: string): { ok: true; value: string | null } | { ok: false; message: string } {
  const t = raw.trim()
  if (!t) return { ok: true, value: null }
  const u = tryParseUrl(t)
  if (!u) return { ok: false, message: "GitHub: ბმული არასწორი ფორმატისაა." }
  const h = hostRoot(u.hostname)
  if (h !== "github.com" && h !== "gist.github.com" && !h.endsWith(".github.com")) {
    return { ok: false, message: "GitHub: მისამართი უნდა იყოს github.com დომენზე." }
  }
  return { ok: true, value: u.toString() }
}

/** ზოგადი ვებბმული (პორტფოლიო და სხვა). */
export function parseOptionalWebUrl(raw: string): { ok: true; value: string | null } | { ok: false; message: string } {
  const t = raw.trim()
  if (!t) return { ok: true, value: null }
  const u = tryParseUrl(t)
  if (!u || !/^https?:$/i.test(u.protocol)) {
    return { ok: false, message: "პორტფოლიო / საიტი: შეიყვანეთ სწორი http(s) მისამართი." }
  }
  if (!u.hostname) return { ok: false, message: "პორტფოლიო / საიტი: დომენი ცარიელია." }
  return { ok: true, value: u.toString() }
}
