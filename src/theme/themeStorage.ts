import { consentGatedGetItem, consentGatedSetItem } from "../lib/consentGatedStorage.ts"
import type { AppTheme } from "./types.ts"
import { THEME_STORAGE_KEY } from "./types.ts"

export function isAppTheme(value: string | null | undefined): value is AppTheme {
  return value === "light" || value === "dark" || value === "system"
}

export function getStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "system"
  const stored = consentGatedGetItem(THEME_STORAGE_KEY)
  return isAppTheme(stored) ? stored : "system"
}

export function setStoredTheme(theme: AppTheme): void {
  consentGatedSetItem(THEME_STORAGE_KEY, theme)
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function resolveTheme(theme: AppTheme): "light" | "dark" {
  if (theme === "system") return getSystemPrefersDark() ? "dark" : "light"
  return theme
}

export function applyThemeClass(resolved: "light" | "dark"): void {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", resolved === "dark")
}