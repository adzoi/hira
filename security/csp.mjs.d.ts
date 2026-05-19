export function buildContentSecurityPolicy(opts?: { dev?: boolean; forMeta?: boolean }): string
export function buildSecurityHeaders(opts?: { dev?: boolean }): Record<string, string>
export function buildHeadersFile(opts?: { dev?: boolean }): string
