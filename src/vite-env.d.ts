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
  /** Sentry browser DSN (public). */
  readonly VITE_SENTRY_DSN?: string
  /** Set to "1" to throw a deliberate error on load for Sentry verification. */
  readonly VITE_SENTRY_TEST_ERROR?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  dataLayer?: unknown[]
}
