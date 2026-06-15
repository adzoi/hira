import { Helmet } from "react-helmet-async"
import { useLocation } from "react-router-dom"

export const SITE_BASE_URL = "https://hira.ge"
export const SITE_OG_IMAGE = `${SITE_BASE_URL}/og-image.png`

export type PageMetaProps = {
  title: string
  description?: string
  /** Absolute URL; defaults to the current route on hira.ge */
  url?: string
}

export function PageMeta({ title, description, url }: PageMetaProps) {
  const { pathname, search } = useLocation()
  const pageUrl = url ?? `${SITE_BASE_URL}${pathname}${search}`

  return (
    <Helmet>
      <title>{title}</title>
      {description ? <meta name="description" content={description} /> : null}
      <meta property="og:title" content={title} />
      {description ? <meta property="og:description" content={description} /> : null}
      <meta property="og:url" content={pageUrl} />
      <meta property="og:image" content={SITE_OG_IMAGE} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="ჰირა" />
      <meta property="og:locale" content="ka_GE" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:image" content={SITE_OG_IMAGE} />
    </Helmet>
  )
}

/** Renders title, description, and Open Graph tags for the current page. */
export function usePageMeta(title: string, description?: string, url?: string) {
  return <PageMeta title={title} description={description} url={url} />
}
