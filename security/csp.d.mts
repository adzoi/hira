export function generateCspNonce(): string
export function injectScriptNonces(html: string, nonce: string): string
export function buildContentSecurityPolicy(opts?: {
  dev?: boolean
  forMeta?: boolean
  nonce?: string
}): string
export function buildSecurityHeaders(opts?: { dev?: boolean; nonce?: string }): Record<string, string>
export function buildHeadersFile(opts?: { dev?: boolean }): string
