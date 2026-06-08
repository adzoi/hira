export type AppTheme = "light" | "dark" | "system"

export const THEME_STORAGE_KEY = "hira-theme"

export const THEME_LABELS: Record<Exclude<AppTheme, "system">, string> = {
  light: "Light",
  dark: "Dark",
}
