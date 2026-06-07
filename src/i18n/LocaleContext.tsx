import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { COOKIE_CONSENT_EVENT, consentGatedSetItem } from "../lib/consentGatedStorage.ts"
import type { AppLocale } from "./types.ts"
import { LOCALE_STORAGE_KEY } from "./types.ts"
import { getStoredLocale, setCurrentLocale, translate } from "./translate.ts"

type LocaleContextValue = {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => getStoredLocale())

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next)
    setCurrentLocale(next)
    if (typeof window !== "undefined") {
      consentGatedSetItem(LOCALE_STORAGE_KEY, next)
      document.documentElement.lang = next === "en" ? "en" : "ka"
    }
  }, [])

  useEffect(() => {
    setCurrentLocale(locale)
    document.documentElement.lang = locale === "en" ? "en" : "ka"
  }, [locale])

  useEffect(() => {
    const syncLocaleAfterConsent = () => {
      const stored = getStoredLocale()
      setLocaleState(stored)
      setCurrentLocale(stored)
      document.documentElement.lang = stored === "en" ? "en" : "ka"
    }
    window.addEventListener(COOKIE_CONSENT_EVENT, syncLocaleAfterConsent)
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, syncLocaleAfterConsent)
  }, [])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider")
  return ctx
}

export function useTranslation() {
  const { t, locale, setLocale } = useLocale()
  return { t, locale, setLocale }
}
