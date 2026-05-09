/** Normalized vacancy stats for `jobs.vacancies` / `jobs.accepted_count` (post-migration defaults). */
export function jobVacancyStats(
  vacancies: number | null | undefined,
  acceptedCount: number | null | undefined,
): { vacancies: number; acceptedCount: number; remaining: number; isFull: boolean } {
  const v = Math.max(1, Math.floor(Number(vacancies)) || 1)
  const rawA = Number(acceptedCount)
  const a = Number.isFinite(rawA) ? Math.max(0, Math.floor(rawA)) : 0
  return {
    vacancies: v,
    acceptedCount: a,
    remaining: Math.max(0, v - a),
    isFull: a >= v,
  }
}
