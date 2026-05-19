export type JobContactPreference = "email" | "phone" | "both"

export const JOB_CONTACT_LABELS: Record<JobContactPreference, string> = {
  email: "ელფოსტა",
  phone: "ტელეფონი",
  both: "ელფოსტა და ტელეფონი",
}

export const JOB_CONTACT_OPTIONS: JobContactPreference[] = ["email", "phone", "both"]

/** Coerce stored/API values to a supported contact preference (defaults to email). */
export function normalizeJobContactPreference(value: string | null | undefined): JobContactPreference {
  const v = String(value ?? "").trim().toLowerCase()
  if (v === "both" || v === "phone" || v === "email") return v
  return "email"
}

export function encodeJobContactPreference(contactEmail: boolean, contactPhone: boolean): JobContactPreference {
  if (contactEmail && contactPhone) return "both"
  if (contactPhone) return "phone"
  return "email"
}

export function parseJobContactPreference(value: string): { contactEmail: boolean; contactPhone: boolean } {
  if (value === "both") return { contactEmail: true, contactPhone: true }
  if (value === "phone") return { contactEmail: false, contactPhone: true }
  return { contactEmail: true, contactPhone: false }
}

export function formatHirerContactForApplicant(params: {
  contactPreference: string
  email: string
  phone: string | null
}): string {
  const { contactPreference, email, phone } = params
  if (contactPreference === "both") {
    const parts: string[] = []
    if (email.trim()) parts.push(`ელფოსტა: ${email.trim()}`)
    if (phone?.trim()) parts.push(`ტელეფონი: ${phone.trim()}`)
    return parts.length > 0 ? parts.join(", ") : "—"
  }
  if (contactPreference === "phone" && phone?.trim()) return `ტელეფონი: ${phone.trim()}`
  return email.trim() ? `ელფოსტა: ${email.trim()}` : "—"
}

export function hirerContactCopyText(params: {
  contactPreference: string
  email: string
  phone: string | null
}): string {
  const { contactPreference, email, phone } = params
  if (contactPreference === "both") {
    const parts: string[] = []
    if (email.trim()) parts.push(email.trim())
    if (phone?.trim()) parts.push(phone.trim())
    return parts.join("\n")
  }
  if (contactPreference === "phone" && phone?.trim()) return phone.trim()
  return email.trim()
}
