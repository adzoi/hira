import { useEffect } from "react"
import I18nText from "../i18n/I18nText.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"

export type InfoSection = {
  headingKey: string
  paragraphKeys: readonly string[]
}

type InfoPageLayoutProps = {
  pageTitleKey: string
  heroHeadingKey: string
  heroSubtitleKey?: string
  lastUpdatedKey?: string
  sections: readonly InfoSection[]
}

export default function InfoPageLayout({
  pageTitleKey,
  heroHeadingKey,
  heroSubtitleKey,
  lastUpdatedKey,
  sections,
}: InfoPageLayoutProps) {
  const { t } = useTranslation()

  useEffect(() => {
    document.title = t(pageTitleKey)
  }, [t, pageTitleKey])

  return (
    <main className="page-enter bg-slate-50">
      <section className="bg-brand">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-14 md:px-6 md:py-20">
          <I18nText
            i18nKey={heroHeadingKey}
            as="h1"
            className="max-w-3xl text-[28px] font-extrabold leading-tight text-white md:text-[42px]"
          />
          {heroSubtitleKey ? (
            <I18nText
              i18nKey={heroSubtitleKey}
              as="p"
              className="mt-5 max-w-2xl text-base leading-relaxed text-white/90 md:text-lg"
            />
          ) : null}
        </div>
      </section>

      <section className="mx-auto w-full max-w-[800px] px-4 py-12 md:px-6 md:py-16">
        {lastUpdatedKey ? (
          <I18nText
            i18nKey={lastUpdatedKey}
            as="p"
            className="mb-8 text-sm text-slate-500"
          />
        ) : null}

        <div className="space-y-10">
          {sections.map((section) => (
            <article key={section.headingKey}>
              <I18nText
                i18nKey={section.headingKey}
                as="h2"
                className="text-xl font-bold text-slate-800 md:text-2xl"
              />
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600 md:text-base">
                {section.paragraphKeys.map((key) => (
                  <I18nText key={key} i18nKey={key} as="p" />
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
