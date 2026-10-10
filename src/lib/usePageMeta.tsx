import { useEffect } from "react"
import { Helmet } from "react-helmet-async"
import { useLocation } from "react-router-dom"

export const SITE_BASE_URL = "https://hira.ge"
export const SITE_OG_IMAGE = `${SITE_BASE_URL}/og-image.png`

export type PageMetaProps = {
  title: string
  description?: string
  /** Absolute URL; defaults to the current route on hira.ge */
  url?: string
  /** Absolute share image URL (1200×630); defaults to the site-wide card. */
  image?: string
  /** Keep thin or empty pages out of search results. */
  noindex?: boolean
}

/** Head tags PageMeta renders itself; the static/server copies of these are dropped once Helmet has its own. */
const STATIC_DUPLICATE_SELECTORS = [
  "title",
  'link[rel="canonical"]',
  'meta[property="og:title"]',
  'meta[property="og:url"]',
  'meta[property="og:image"]',
  'meta[property="og:type"]',
  'meta[property="og:site_name"]',
  'meta[property="og:locale"]',
  'meta[name="twitter:card"]',
  'meta[name="twitter:image"]',
]
const STATIC_DESCRIPTION_SELECTORS = ['meta[name="description"]', 'meta[property="og:description"]']

/**
 * react-helmet-async appends its tags instead of replacing the ones in index.html (or the ones the
 * server injects), leaving two titles/descriptions/canonicals per page. Search engines may pick the
 * generic first copy, so drop the static ones once the page's own are in the head.
 */
function removeStaticHeadDuplicates(hasDescription: boolean) {
  const selectors = hasDescription ? [...STATIC_DUPLICATE_SELECTORS, ...STATIC_DESCRIPTION_SELECTORS] : STATIC_DUPLICATE_SELECTORS
  for (const selector of selectors) {
    const all = document.head.querySelectorAll(selector)
    const hasOwn = Array.from(all).some((el) => !el.hasAttribute("data-static"))
    if (!hasOwn) continue
    all.forEach((el) => {
      if (el.hasAttribute("data-static")) el.remove()
    })
  }
}

export function PageMeta({ title, description, url, image, noindex }: PageMetaProps) {
  const { pathname, search } = useLocation()
  const pageUrl = url ?? `${SITE_BASE_URL}${pathname}${search}`
  const ogImage = image ?? SITE_OG_IMAGE

  useEffect(() => {
    // Helmet commits on the next animation frame, so wait for it before looking for duplicates.
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => removeStaticHeadDuplicates(Boolean(description)))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [pathname, title, description, url])

  return (
    <Helmet>
      <title>{title}</title>
      {description ? <meta name="description" content={description} /> : null}
      <meta property="og:title" content={title} />
      {description ? <meta property="og:description" content={description} /> : null}
      <meta property="og:url" content={pageUrl} />
      {noindex ? <meta name="robots" content="noindex, follow" /> : null}
      <link rel="canonical" href={url ?? `${SITE_BASE_URL}${pathname}`} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="ჰირა" />
      <meta property="og:locale" content="ka_GE" />
      {image ? <meta property="og:image:width" content="1200" /> : null}
      {image ? <meta property="og:image:height" content="630" /> : null}
      <meta name="twitter:card" content={image ? "summary_large_image" : "summary"} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  )
}

/** Renders title, description, and Open Graph tags for the current page. */
export function usePageMeta(
  title: string,
  description?: string,
  url?: string,
  options?: { image?: string; noindex?: boolean },
) {
  return <PageMeta title={title} description={description} url={url} image={options?.image} noindex={options?.noindex} />
}
