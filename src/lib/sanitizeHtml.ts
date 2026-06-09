import DOMPurify from "dompurify"

/** Strip all HTML tags/attributes — safe for plain-text fields rendered in React. */
export function sanitizeHtmlForDisplay(text: string | null | undefined): string {
  if (text == null) return ""
  return DOMPurify.sanitize(String(text), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
}
