export const COOKIE_CONSENT_KEY = "hira-cookie-consent"
export const COOKIE_CONSENT_EVENT = "hira-cookie-consent-accepted"

export type CookieConsentLevel = "all" | "essential"

const memoryStore = new Map<string, string>()

export function getCookieConsentLevel(): CookieConsentLevel | null {
  try {
    const value = window.localStorage.getItem(COOKIE_CONSENT_KEY)
    if (value === "accepted" || value === "all") return "all"
    if (value === "essential") return "essential"
    return null
  } catch {
    return null
  }
}

/** True once the user has chosen Accept All or Essential Only. */
export function hasCookieChoice(): boolean {
  return getCookieConsentLevel() !== null
}

/** Alias used by the cookie banner — any stored choice hides the banner. */
export function hasCookieConsent(): boolean {
  return hasCookieChoice()
}

/** True only when the user accepted all cookies (including preferences). */
export function hasFullCookieConsent(): boolean {
  return getCookieConsentLevel() === "all"
}

function isEssentialKey(key: string): boolean {
  if (key === COOKIE_CONSENT_KEY) return true
  return key.startsWith("sb-") && key.includes("auth")
}

function canPersistToLocalStorage(key: string): boolean {
  const level = getCookieConsentLevel()
  if (level === "all") return true
  if (level === "essential") return isEssentialKey(key)
  return false
}

export function consentGatedGetItem(key: string): string | null {
  if (!hasCookieChoice()) {
    return memoryStore.get(key) ?? null
  }
  if (canPersistToLocalStorage(key)) {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  }
  return memoryStore.get(key) ?? null
}

export function consentGatedSetItem(key: string, value: string): void {
  if (!hasCookieChoice()) {
    memoryStore.set(key, value)
    return
  }
  if (canPersistToLocalStorage(key)) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Ignore storage errors (private browsing, quota, etc.)
    }
    return
  }
  memoryStore.set(key, value)
}

export function consentGatedRemoveItem(key: string): void {
  if (!hasCookieChoice()) {
    memoryStore.delete(key)
    return
  }
  if (canPersistToLocalStorage(key)) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore storage errors
    }
    return
  }
  memoryStore.delete(key)
}

/** Supabase auth storage adapter — persists per the user's cookie choice. */
export const consentGatedStorage = {
  getItem: (key: string) => consentGatedGetItem(key),
  setItem: (key: string, value: string) => consentGatedSetItem(key, value),
  removeItem: (key: string) => consentGatedRemoveItem(key),
}

function persistConsent(level: CookieConsentLevel): void {
  try {
    if (level === "all") {
      for (const [key, value] of memoryStore) {
        window.localStorage.setItem(key, value)
      }
      memoryStore.clear()
      window.localStorage.setItem(COOKIE_CONSENT_KEY, "accepted")
    } else {
      for (const [key, value] of memoryStore) {
        if (isEssentialKey(key)) {
          window.localStorage.setItem(key, value)
          memoryStore.delete(key)
        }
      }
      window.localStorage.setItem(COOKIE_CONSENT_KEY, "essential")
    }
  } catch {
    // Ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT))
}

export function acceptAllCookies(): void {
  persistConsent("all")
}

export function acceptEssentialCookies(): void {
  persistConsent("essential")
}

/** @deprecated Use acceptAllCookies — kept for existing imports. */
export function acceptCookieConsent(): void {
  acceptAllCookies()
}
