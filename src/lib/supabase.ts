import { createClient } from "@supabase/supabase-js"
import type { Database } from "../types/database.types.ts"
import { consentGatedStorage } from "./consentGatedStorage.ts"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

/** sessionStorage flag: this tab arrived via a password-recovery email link. */
export const AUTH_RECOVERY_HINT_KEY = "hira-auth-recovery"

/**
 * Record a recovery link before createClient runs — the SDK consumes and blanks the
 * `#...&type=recovery` hash during init, so later checks can no longer see it.
 */
function captureRecoveryHint(): void {
  if (typeof window === "undefined") return
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""))
  const search = new URLSearchParams(window.location.search)
  if (hash.get("type") !== "recovery" && search.get("type") !== "recovery") return
  try {
    sessionStorage.setItem(AUTH_RECOVERY_HINT_KEY, "1")
  } catch {
    // Ignore private browsing / quota errors.
  }
}

if (isSupabaseConfigured) captureRecoveryHint()

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: consentGatedStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

/** PostgREST / Supabase errors are often plain objects with `message`, not `Error`. */
export function formatSupabaseClientError(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === "string" && m.length > 0) return m
  }
  return fallback
}