// @ts-ignore -- Deno resolves npm: specifiers at runtime.
import * as Sentry from "npm:@sentry/deno@^10"
import { recordEdge5xx } from "./alerting.ts"
import { corsHeadersFor } from "./cors.ts"
import {
  bindRequestLog,
  createRequestId,
  logRequestComplete,
  RequestLogContext,
} from "./structuredLog.ts"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}

let initialized = false

function sentryDsn(): string {
  return Deno.env.get("SENTRY_DSN")?.trim() ?? ""
}

function ensureSentryInit(): void {
  if (initialized) return
  const dsn = sentryDsn()
  if (!dsn) return
  Sentry.init({
    dsn,
    defaultIntegrations: false,
    tracesSampleRate: 0,
  })
  initialized = true
}

function isSentryEnabled(): boolean {
  return Boolean(sentryDsn())
}

function sentryTags(functionName: string): Record<string, string> {
  const tags: Record<string, string> = { function: functionName }
  const region = Deno.env.get("SB_REGION")
  const executionId = Deno.env.get("SB_EXECUTION_ID")
  if (region) tags.region = region
  if (executionId) tags.execution_id = executionId
  return tags
}

function internalErrorResponse(req: Request): Response {
  return new Response(JSON.stringify({ ok: false, error: "Internal server error" }), {
    status: 500,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  })
}

async function captureAndFlush(error: unknown, functionName: string): Promise<void> {
  Sentry.captureException(error, { tags: sentryTags(functionName) })
  await Sentry.flush(2000)
}

function shouldThrowTestError(req: Request): boolean {
  if (Deno.env.get("SENTRY_TEST_ERROR") !== "1") return false
  return new URL(req.url).searchParams.has("sentry_test")
}

function shouldSkipRequestLog(req: Request): boolean {
  return req.method === "OPTIONS"
}

async function finalizeRequestLog(
  ctx: RequestLogContext,
  status: number,
  latencyMs: number,
): Promise<void> {
  logRequestComplete(ctx.functionName, ctx.requestId, status, latencyMs, ctx.getFields())
  if (status >= 500) {
    await recordEdge5xx(ctx.functionName, status, ctx.requestId)
  }
}

export type EdgeHandler = (req: Request) => Response | Promise<Response>

/** Wrap a Supabase Edge Function handler with Sentry error capture and JSON request logging. */
export function serveWithSentry(functionName: string, handler: EdgeHandler): void {
  ensureSentryInit()

  Deno.serve(async (req) => {
    const requestId = createRequestId()
    const logCtx = new RequestLogContext(functionName, requestId)
    bindRequestLog(req, logCtx)
    const startedAt = performance.now()
    const skipLog = shouldSkipRequestLog(req)

    if (shouldThrowTestError(req)) {
      const err = new Error(`[Sentry test] deliberate error from ${functionName}`)
      if (isSentryEnabled()) await captureAndFlush(err, functionName)
      if (!skipLog) {
        await finalizeRequestLog(logCtx, 500, performance.now() - startedAt)
      }
      return new Response(JSON.stringify({ ok: false, error: "Sentry test error" }), {
        status: 500,
        headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
      })
    }

    try {
      const response = await handler(req)
      if (!skipLog) {
        await finalizeRequestLog(logCtx, response.status, performance.now() - startedAt)
      }
      return response
    } catch (error) {
      if (isSentryEnabled()) await captureAndFlush(error, functionName)
      if (!skipLog) {
        await finalizeRequestLog(logCtx, 500, performance.now() - startedAt)
      }
      return internalErrorResponse(req)
    }
  })
}
