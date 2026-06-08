import type { AppTheme } from "../theme/types.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { useTheme } from "../theme/ThemeContext.tsx"

type ThemeToggleProps = {
  variant?: "icon" | "menu"
}

const MENU_OPTIONS: AppTheme[] = ["light", "dark", "system"]

export default function ThemeToggle({ variant = "menu" }: ThemeToggleProps) {
  const { t } = useTranslation()
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme()

  if (variant === "icon") {
    const isDark = resolvedTheme === "dark"
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base leading-none text-slate-600 transition hover:bg-slate-50 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        aria-label={isDark ? t("nav.themeLight") : t("nav.themeDark")}
        title={isDark ? t("nav.themeLight") : t("nav.themeDark")}
      >
        <span aria-hidden>{isDark ? "☀️" : "🌙"}</span>
      </button>
    )
  }

  return (
    <div className="border-t border-slate-100 px-2 py-2 dark:border-slate-700">
      <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {t("nav.theme")}
      </p>
      <div className="flex gap-1 px-1">
        {MENU_OPTIONS.map((option) => {
          const active = theme === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => setTheme(option)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                active
                  ? "bg-[#E8F4FF] text-[#0088FF] ring-1 ring-[#B3DEFF] dark:bg-[#1a2d42] dark:text-[#66b3ff] dark:ring-[#2d4a66]"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
              aria-pressed={active}
            >
              {option === "light" ? t("nav.themeLight") : option === "dark" ? t("nav.themeDark") : t("nav.themeSystem")}
            </button>
          )
        })}
      </div>
    </div>
  )
}
