import { isSupabaseConfigured, supabase } from "./supabase"
import { supabaseEdgeHeaders } from "./supabaseEdgeHeaders"

export const AUTH_COOLDOWN_MS = 15 * 60 * 1000

export type AuthRateLimitAction = "register" | "recover" | "reauth"

function functionsBaseUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL ?? ""
  return `${base.replace(/\/$/, "")}/functions/v1`
}

export function isAuthRateLimited(status?: number, message?: string): boolean {
  if (status === 429) return true
  const lower = message?.toLowerCase() ?? ""
  return lower.includes("too many") || lower.includes("rate limit")
}

/** Seconds from GoTrue's "you can only request this after N seconds" message, if present. */
export function retryAfterFromAuthMessage(message?: string): number | undefined {
  const match = message?.match(/after (\d+) seconds?/i)
  return match ? Number(match[1]) : undefined
}

export function authCooldownUntil(retryAfterSeconds?: number): number {
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return Date.now() + retryAfterSeconds * 1000
  }
  return Date.now() + AUTH_COOLDOWN_MS
}

/** Consume one auth attempt for register / recover / reauth (login uses auth-login proxy). */
export async function consumeAuthRateLimit(
  action: AuthRateLimitAction,
  email?: string,
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  if (!isSupabaseConfigured) {
    return { ok: false, retryAfterSeconds: Math.ceil(AUTH_COOLDOWN_MS / 1000) }
  }

  const res = await fetch(`${functionsBaseUrl()}/auth-rate-limit`, {
    method: "POST",
    headers: supabaseEdgeHeaders(),
    body: JSON.stringify({ action, email: email?.trim() }),
  })

  if (res.ok) return { ok: true }

  const retryAfter = Number.parseInt(res.headers.get("Retry-After") ?? "", 10)
  return {
    ok: false,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter
      : Math.ceil(AUTH_COOLDOWN_MS / 1000),
  }
}

/** Login via rate-limited edge proxy (5 attempts / 15 min per IP + email). */
export async function signInWithRateLimit(
  email: string,
  password: string,
): Promise<{ error: { message: string; status?: number } | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: { message: "Supabase not configured" } }
  }

  const res = await fetch(`${functionsBaseUrl()}/auth-login`, {
    method: "POST",
    headers: supabaseEdgeHeaders(),
    body: JSON.stringify({ email: email.trim(), password }),
  })

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>

  if (!res.ok) {
    const message =
      typeof data.error === "string" ? data.error : "Login failed"
    return { error: { message, status: res.status } }
  }

  const accessToken = typeof data.access_token === "string" ? data.access_token : ""
  const refreshToken = typeof data.refresh_token === "string" ? data.refresh_token : ""
  if (!accessToken || !refreshToken) {
    return { error: { message: "Invalid login response", status: 502 } }
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error) {
    return { error: { message: error.message, status: error.status } }
  }

  return { error: null }
}
