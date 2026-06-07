import { consentGatedGetItem, hasFullCookieConsent } from "../lib/consentGatedStorage.ts"
import type { AppLocale } from "./types.ts"
import { LOCALE_STORAGE_KEY } from "./types.ts"
import { en } from "./translations/en.ts"
import { ka } from "./translations/ka.ts"

type TranslationTree = { [key: string]: string | TranslationTree }

const translations: Record<AppLocale, TranslationTree> = { ka, en }

let currentLocale: AppLocale = "ka"

export function getStoredLocale(): AppLocale {
  if (typeof window === "undefined") return "ka"
  if (!hasFullCookieConsent()) return "ka"
  const stored = consentGatedGetItem(LOCALE_STORAGE_KEY)
  return stored === "en" ? "en" : "ka"
}

export function setCurrentLocale(locale: AppLocale) {
  currentLocale = locale
}

export function getCurrentLocale(): AppLocale {
  return currentLocale
}

function resolve(tree: TranslationTree, key: string): string | undefined {
  const value = key.split(".").reduce<string | TranslationTree | undefined>((node, part) => {
    if (node == null || typeof node === "string") return undefined
    return node[part]
  }, tree)
  return typeof value === "string" ? value : undefined
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name]
    return value == null ? `{${name}}` : String(value)
  })
}

export function translate(
  locale: AppLocale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const template =
    resolve(translations[locale], key) ??
    resolve(translations.ka, key) ??
    key
  return interpolate(template, params)
}

export function t(key: string, params?: Record<string, string | number>): string {
  return translate(getCurrentLocale(), key, params)
}
