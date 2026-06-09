import { useEffect } from "react"

const META_DESCRIPTION_SELECTOR = 'meta[name="description"]'

function setMetaDescription(content: string | undefined) {
  let meta = document.querySelector<HTMLMetaElement>(META_DESCRIPTION_SELECTOR)
  if (!content?.trim()) {
    meta?.remove()
    return
  }
  if (!meta) {
    meta = document.createElement("meta")
    meta.setAttribute("name", "description")
    document.head.appendChild(meta)
  }
  meta.setAttribute("content", content.trim())
}

/** Sets document title and optional meta description for the current page. */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    document.title = title
    setMetaDescription(description)
  }, [title, description])
}
