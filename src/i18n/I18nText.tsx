import type { ElementType, ReactNode } from "react"
import { useTranslation } from "./LocaleContext.tsx"

type I18nTextProps = {
  i18nKey: string
  params?: Record<string, string | number>
  as?: ElementType
  className?: string
  children?: ReactNode
}

/** Renders translated copy with a `data-i18n` key for locale-driven updates. */
export default function I18nText({ i18nKey, params, as: Tag = "span", className }: I18nTextProps) {
  const { t } = useTranslation()
  return (
    <Tag data-i18n={i18nKey} className={className}>
      {t(i18nKey, params)}
    </Tag>
  )
}
