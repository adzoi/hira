import { Helmet } from "react-helmet-async"
import { useLocation } from "react-router-dom"

export const SITE_BASE_URL = "https://hira.ge"

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
    </Helmet>
  )
}

/** Renders title, description, and Open Graph tags for the current page. */
export function usePageMeta(title: string, description?: string, url?: string) {
  return <PageMeta title={title} description={description} url={url} />
}
