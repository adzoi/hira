/**
 * Ambient types for Deno URL imports used by Supabase Edge Functions.
 * The workspace TypeScript language service cannot fetch remote Deno modules
 * (https://esm.sh, https://deno.land); Deno resolves them at deploy/runtime.
 *
 * `createClient` is typed loosely so we do not pull in generated Database
 * generics from the npm package (those infer `never` without a schema).
 */
declare module "https://esm.sh/@supabase/supabase-js@2.49.1" {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: Record<string, unknown>,
  ): any
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: Record<string, unknown>,
  ): any
}

declare module "https://esm.sh/@upstash/redis@1.20.1" {
  export class Redis {
    static fromEnv(): Redis
    get<T = unknown>(key: string): Promise<T | null>
    set(
      key: string,
      value: unknown,
      opts?: { ex?: number; px?: number; nx?: boolean; xx?: boolean },
    ): Promise<"OK" | null>
    setex(key: string, seconds: number, value: unknown): Promise<"OK" | null>
    expire(key: string, seconds: number): Promise<number>
    zadd(key: string, scoreMember: { score: number; member: string }): Promise<number>
    zremrangebyscore(key: string, min: number, max: number): Promise<number>
    zcard(key: string): Promise<number>
  }
}

declare module "https://esm.sh/@upstash/ratelimit@0.4.4" {
  export class Ratelimit {
    constructor(opts: {
      redis: unknown
      limiter: unknown
      analytics?: boolean
      prefix?: string
    })
    static slidingWindow(requests: number, window: string): unknown
    limit(key: string): Promise<{ success: boolean; reset: number }>
  }
}

declare module "https://deno.land/x/denomailer@1.6.0/mod.ts" {
  export class SMTPClient {
    constructor(config: {
      connection: {
        hostname: string
        port?: number
        tls?: boolean
        auth?: {
          username: string
          password: string
        }
      }
    })
    send(config: {
      from: string
      to: string | string[]
      cc?: string | string[]
      bcc?: string | string[]
      subject: string
      content?: string
      html?: string
      replyTo?: string
    }): Promise<void>
    close(): Promise<void>
  }
}

declare module "npm:satori@0.12.2" {
  export default function satori(
    element: unknown,
    options: {
      width: number
      height: number
      fonts: Array<{ name: string; data: ArrayBuffer; weight?: number; style?: "normal" | "italic" }>
    },
  ): Promise<string>
}

declare module "npm:@resvg/resvg-wasm@2.6.2" {
  export function initWasm(module: Response | Promise<Response> | ArrayBuffer | Uint8Array): Promise<void>
  export class Resvg {
    constructor(svg: string, options?: { fitTo?: { mode: "width" | "height" | "zoom"; value: number } })
    render(): { asPng(): Uint8Array }
  }
}
