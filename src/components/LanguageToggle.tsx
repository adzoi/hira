import { LOCALE_LABELS, type AppLocale } from "../i18n/types.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"

const LOCALE_FLAGS: Record<AppLocale, string> = {
  ka: "🇬🇪",
  en: "🇬🇧",
}

type LanguageToggleProps = {
  locale: AppLocale
  onChange: (locale: AppLocale) => void
  variant?: "flags" | "menu" | "compact"
}

export default function LanguageToggle({ locale, onChange, variant = "menu" }: LanguageToggleProps) {
  const { t } = useTranslation()
  const options: AppLocale[] = ["ka", "en"]

  if (variant === "compact") {
    const other = locale === "ka" ? "en" : "ka"
    return (
      <button
        type="button"
        onClick={() => onChange(other)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#E8F4FF] text-base leading-none ring-2 ring-[#0088FF] ring-offset-1 transition hover:bg-[#D4EEFF]"
        aria-label={`${LOCALE_LABELS[locale]} — ${t("nav.language")}`}
        title={`${LOCALE_LABELS[other]}`}
      >
        <span aria-hidden>{LOCALE_FLAGS[locale]}</span>
      </button>
    )
  }

  if (variant === "flags") {
    return (
      <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label={t("nav.language")}>
        {options.map((option) => {
          const active = locale === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`flex h-8 w-8 items-center justify-center rounded-md text-base leading-none transition ${
                active
                  ? "bg-[#E8F4FF] ring-2 ring-[#0088FF] ring-offset-1"
                  : "opacity-50 hover:bg-slate-50 hover:opacity-100"
              }`}
              aria-pressed={active}
              aria-label={LOCALE_LABELS[option]}
              title={LOCALE_LABELS[option]}
            >
              <span aria-hidden>{LOCALE_FLAGS[option]}</span>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="border-t border-slate-100 px-2 py-2">
      <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {t("nav.language")}
      </p>
      <div className="flex gap-1 px-1">
        {options.map((option) => {
          const active = locale === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                active
                  ? "bg-[#E8F4FF] text-[#0088FF] ring-1 ring-[#B3DEFF]"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
              aria-pressed={active}
            >
              {LOCALE_LABELS[option]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
