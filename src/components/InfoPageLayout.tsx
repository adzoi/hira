import I18nText from "../i18n/I18nText.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { usePageMeta } from "../lib/usePageMeta.tsx"

export type InfoSection = {
  heading: string
  paragraphs: readonly string[]
}

type InfoPageLayoutProps = {
  pageTitle: string
  metaDescription: string
  heroHeading: string
  heroSubtitle?: string
  lastUpdated?: string
  sections: readonly InfoSection[]
}

export default function InfoPageLayout({
  pageTitle,
  metaDescription,
  heroHeading,
  heroSubtitle,
  lastUpdated,
  sections,
}: InfoPageLayoutProps) {
  const { t } = useTranslation()
  const pageMeta = usePageMeta(t(pageTitle), t(metaDescription))

  return (
    <>
      {pageMeta}
      <main className="page-enter bg-slate-50">
        <section className="bg-brand">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-14 md:px-6 md:py-20">
            <I18nText
              i18nKey={heroHeading}
              as="h1"
              className="max-w-3xl text-[28px] font-extrabold leading-tight text-white md:text-[42px]"
            />
            {heroSubtitle ? (
              <I18nText
                i18nKey={heroSubtitle}
                as="p"
                className="mt-5 max-w-2xl text-base leading-relaxed text-white/90 md:text-lg"
              />
            ) : null}
          </div>
        </section>

        <section className="mx-auto w-full max-w-[800px] px-4 py-12 md:px-6 md:py-16">
          {lastUpdated ? (
            <I18nText
              i18nKey={lastUpdated}
              as="p"
              className="mb-8 text-sm text-slate-500"
            />
          ) : null}

          <div className="space-y-10">
            {sections.map((section) => (
              <article key={section.heading}>
                <I18nText
                  i18nKey={section.heading}
                  as="h2"
                  className="text-xl font-bold text-slate-800 md:text-2xl"
                />
                <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600 md:text-base">
                  {section.paragraphs.map((key) => (
                    <I18nText key={key} i18nKey={key} as="p" />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
