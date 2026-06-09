/// <reference types="vite/client" />

declare module "*.webp" {
  const src: string
  export default src
}

declare module "*.jsx" {
  import type { ComponentType } from "react"
  const Component: ComponentType<Record<string, unknown>>
  export default Component
}

interface ImportMetaEnv {
  /** Supabase project URL (public). */
  readonly VITE_SUPABASE_URL: string
  /** Supabase publishable/anon key (public; RLS enforces access). */
  readonly VITE_SUPABASE_ANON_KEY: string
  /** PayPal client ID for Smart Buttons (public). */
  readonly VITE_PAYPAL_CLIENT_ID?: string
  /** Set to "1" for Playwright diagnostics only. */
  readonly VITE_PAYPAL_E2E_DIAG?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
