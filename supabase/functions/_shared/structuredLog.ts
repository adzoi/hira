declare const Deno: {
  env: { get: (key: string) => string | undefined }
}

export type LogLevel = "info" | "warn" | "error"

export type StructuredLogFields = Record<string, unknown>

export type StructuredLogEntry = {
  ts: string
  level: LogLevel
  function: string
  message: string
  request_id?: string
  success?: boolean
  status?: number
  latency_ms?: number
} & StructuredLogFields

function writeLog(level: LogLevel, line: string): void {
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

/** Emit a single JSON log line (stdout/stderr). */
export function logStructured(
  level: LogLevel,
  functionName: string,
  message: string,
  fields?: StructuredLogFields,
): void {
  const entry: StructuredLogEntry = {
    ts: new Date().toISOString(),
    level,
    function: functionName,
    message,
    ...(fields ?? {}),
  }
  writeLog(level, JSON.stringify(entry))
}

export class RequestLogContext {
  private fields: StructuredLogFields = {}

  constructor(
    readonly functionName: string,
    readonly requestId: string,
  ) {}

  /** Merge request-scoped identifiers included in the final request_complete log. */
  set(fields: StructuredLogFields): void {
    Object.assign(this.fields, fields)
  }

  getFields(): StructuredLogFields {
    return { ...this.fields }
  }

  /** Log a sub-event within the same request (e.g. a downstream API call). */
  event(message: string, fields?: StructuredLogFields, level: LogLevel = "info"): void {
    logStructured(level, this.functionName, message, {
      request_id: this.requestId,
      ...this.fields,
      ...(fields ?? {}),
    })
  }
}

const contextByRequest = new WeakMap<Request, RequestLogContext>()

export function bindRequestLog(req: Request, ctx: RequestLogContext): void {
  contextByRequest.set(req, ctx)
}

export function requestLog(req: Request): RequestLogContext | null {
  return contextByRequest.get(req) ?? null
}

export function createRequestId(): string {
  const executionId = Deno.env.get("SB_EXECUTION_ID")?.trim()
  if (executionId) return executionId
  return crypto.randomUUID()
}

export function logRequestComplete(
  functionName: string,
  requestId: string,
  status: number,
  latencyMs: number,
  fields: StructuredLogFields = {},
): void {
  const success = status < 500
  logStructured(success ? "info" : "error", functionName, "request_complete", {
    request_id: requestId,
    success,
    status,
    latency_ms: Math.round(latencyMs),
    ...fields,
  })
}
