import { consentGatedGetItem, hasFullCookieConsent } from "../lib/consentGatedStorage.ts"
import type { AppLocale } from "./types.ts"
import { LOCALE_STORAGE_KEY } from "./types.ts"
import { ka } from "./translations/ka.ts"

type TranslationTree = { [key: string]: string | TranslationTree }

let enTranslations: TranslationTree | null = null
let enLoadPromise: Promise<void> | null = null

export function loadEnTranslations(): Promise<void> {
  if (enTranslations) return Promise.resolve()
  if (!enLoadPromise) {
    enLoadPromise = import("./translations/en.ts").then((mod) => {
      enTranslations = mod.en
    })
  }
  return enLoadPromise
}

function translationTree(locale: AppLocale): TranslationTree {
  if (locale === "en") {
    if (!enTranslations) void loadEnTranslations()
    return enTranslations ?? ka
  }
  return ka
}

let currentLocale: AppLocale = "ka"

export function getStoredLocale(): AppLocale {
  if (typeof window === "undefined") return "ka"
  if (!hasFullCookieConsent()) return "ka"
  const stored = consentGatedGetItem(LOCALE_STORAGE_KEY)
  return stored === "en" ? "en" : "ka"
}

if (typeof window !== "undefined" && getStoredLocale() === "en") {
  void loadEnTranslations()
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
    resolve(translationTree(locale), key) ??
    resolve(ka, key) ??
    key
  return interpolate(template, params)
}

export function t(key: string, params?: Record<string, string | number>): string {
  return translate(getCurrentLocale(), key, params)
}
