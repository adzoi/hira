import type { ImgHTMLAttributes } from "react"

type OptimizedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "width" | "height"> & {
  width: number
  height: number
  loading?: "lazy" | "eager"
  fetchPriority?: "high" | "low" | "auto"
}

/** Image with lazy loading, async decode, and required dimensions to prevent layout shift. */
export function OptimizedImage({
  loading = "lazy",
  decoding = "async",
  ...props
}: OptimizedImageProps) {
  return <img loading={loading} decoding={decoding} {...props} />
}
