import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { COOKIE_CONSENT_EVENT } from "../lib/consentGatedStorage.ts"
import type { AppTheme } from "./types.ts"
import { applyThemeClass, getStoredTheme, getSystemPrefersDark, resolveTheme, setStoredTheme } from "./themeStorage.ts"

type ThemeContextValue = {
  theme: AppTheme
  resolvedTheme: "light" | "dark"
  setTheme: (theme: AppTheme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => getStoredTheme())
  const [systemDark, setSystemDark] = useState(() => getSystemPrefersDark())

  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme, systemDark])

  const setTheme = useCallback((next: AppTheme) => {
    setThemeState(next)
    setStoredTheme(next)
    applyThemeClass(resolveTheme(next))
  }, [])

  const toggleTheme = useCallback(() => {
    const nextResolved = resolveTheme(theme) === "dark" ? "light" : "dark"
    setTheme(nextResolved)
  }, [theme, setTheme])

  useEffect(() => {
    applyThemeClass(resolveTheme(theme))
  }, [theme, systemDark])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setSystemDark(mq.matches)
    onChange()
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  useEffect(() => {
    const syncThemeAfterConsent = () => {
      const stored = getStoredTheme()
      setThemeState(stored)
      applyThemeClass(resolveTheme(stored))
    }
    window.addEventListener(COOKIE_CONSENT_EVENT, syncThemeAfterConsent)
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, syncThemeAfterConsent)
  }, [])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
