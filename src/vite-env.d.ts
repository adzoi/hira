/// <reference types="vite/client" />

declare module "*.jsx" {
  import type { ComponentType } from "react"
  const Component: ComponentType<Record<string, unknown>>
  export default Component
}

interface ImportMetaEnv {
  readonly VITE_PAYPAL_CLIENT_ID?: string
  readonly VITE_PAYPAL_E2E_DIAG?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
