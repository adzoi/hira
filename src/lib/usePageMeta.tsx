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

export function PageMeta({ title, description, url, image, noindex }: PageMetaProps) {
  const { pathname, search } = useLocation()
  const pageUrl = url ?? `${SITE_BASE_URL}${pathname}${search}`
  const ogImage = image ?? SITE_OG_IMAGE

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
