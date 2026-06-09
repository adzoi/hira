import { Link } from "react-router-dom"
import I18nText from "../i18n/I18nText.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { usePageMeta } from "../lib/usePageMeta.ts"

const valueCards = [
  { titleKey: "about.qualityTitle", descKey: "about.qualityDesc" },
  { titleKey: "about.trustTitle", descKey: "about.trustDesc" },
  { titleKey: "about.communityTitle", descKey: "about.communityDesc" },
] as const

export default function AboutPage() {
  const { t } = useTranslation()

  usePageMeta(t("about.pageTitle"), t("about.metaDescription"))

  return (
    <main className="page-enter bg-slate-50">
      <section className="bg-brand">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-14 md:px-6 md:py-20">
          <I18nText
            i18nKey="about.heroHeading"
            as="h1"
            className="max-w-3xl text-[28px] font-extrabold leading-tight text-white md:text-[42px]"
          />
          <I18nText
            i18nKey="about.heroMission"
            as="p"
            className="mt-5 max-w-2xl text-base leading-relaxed text-white/90 md:text-lg"
          />
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-6 md:py-16">
        <I18nText i18nKey="about.storyHeading" as="h2" className="text-2xl font-bold text-slate-800 md:text-3xl" />
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-slate-600 md:text-base">
          <I18nText i18nKey="about.storyP1" as="p" />
          <I18nText i18nKey="about.storyP2" as="p" />
          <I18nText i18nKey="about.storyP3" as="p" />
        </div>
      </section>

      <section id="how-it-works" className="border-y border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-6 md:py-16">
          <I18nText
            i18nKey="about.valuesHeading"
            as="h2"
            className="text-2xl font-bold text-slate-800 md:text-3xl"
          />
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
            {valueCards.map((card) => (
              <article
                key={card.titleKey}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm"
              >
                <I18nText i18nKey={card.titleKey} as="h3" className="text-lg font-bold text-slate-800" />
                <I18nText i18nKey={card.descKey} as="p" className="mt-3 text-sm leading-relaxed text-slate-600" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-slate-200 bg-brand">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-12 text-center md:px-6 md:py-16">
          <I18nText
            i18nKey="about.ctaHeading"
            as="h2"
            className="text-2xl font-bold text-white md:text-3xl"
          />
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/listing/new"
              className="inline-flex h-11 min-w-[200px] items-center justify-center rounded-lg bg-white px-6 text-sm font-semibold text-brand transition hover:bg-brand-muted"
            >
              <span data-i18n="about.ctaPostService">{t("about.ctaPostService")}</span>
            </Link>
            <Link
              to="/browse"
              className="inline-flex h-11 min-w-[200px] items-center justify-center rounded-lg border-2 border-white/80 bg-transparent px-6 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <span data-i18n="about.ctaFindFreelancer">{t("about.ctaFindFreelancer")}</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
