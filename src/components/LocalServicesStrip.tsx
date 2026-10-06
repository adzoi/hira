import { Link } from "react-router-dom"
import { useTranslation } from "../i18n/LocaleContext.tsx"

const ITEMS = [
  { slug: "home-services", icon: "🔧" },
  { slug: "tutoring-education", icon: "📚" },
  { slug: "photography", icon: "📷" },
  { slug: "automotive", icon: "🚗" },
  { slug: "lifestyle-personal", icon: "💇" },
] as const

/** Home page entry point to in-person services (static, no data fetch). */
export default function LocalServicesStrip() {
  const { t } = useTranslation()
  return (
    <section className="border-x border-b border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-[#1B2B4B]">{t("local.stripHeading")}</h2>
            <p className="mt-1 text-sm text-slate-600">{t("local.stripBody")}</p>
          </div>
          <Link to="/local" className="text-sm font-semibold text-[#0088FF] hover:underline">
            {t("local.stripAll")} →
          </Link>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ITEMS.map((item) => (
            <Link
              key={item.slug}
              to={`/freelancers/${item.slug}`}
              className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-[#1B2B4B] transition hover:border-[#0088FF] hover:bg-[#E8F4FF]"
            >
              <span className="text-xl" aria-hidden>
                {item.icon}
              </span>
              {t(`local.roots.${item.slug}`)}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
