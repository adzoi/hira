import type { JobRow } from "./dashboardShared.ts"

export const STALE_JOB_DAYS = 7
export const DAY_MS = 24 * 60 * 60 * 1000

/** Open, nobody applied, and the "no response" clock is older than a week (same rule as the daily reminder). */
export function isStaleJob(job: JobRow, applicantCount: number, now = Date.now()): boolean {
  if (job.status !== "open" || applicantCount > 0) return false
  const clock = Date.parse(job.stale_clock_at ?? job.created_at)
  return Number.isFinite(clock) && now - clock >= STALE_JOB_DAYS * DAY_MS
}
