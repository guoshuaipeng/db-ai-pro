/** Slow-query threshold helpers. */

export const DEFAULT_SLOW_QUERY_MS = 1000
const SLOW_MIN = 50
const SLOW_MAX = 600_000

export function clampSlowQueryMs(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_SLOW_QUERY_MS
  return Math.min(SLOW_MAX, Math.max(SLOW_MIN, Math.round(n)))
}

export function isSlowQuery(elapsedMs: number | null | undefined, thresholdMs: number): boolean {
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs)) return false
  return elapsedMs >= thresholdMs
}

/** Human-friendly duration for chips / history. */
export function formatElapsedMs(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return '—'
  if (elapsedMs < 1000) return `${Math.round(elapsedMs)} ms`
  const sec = elapsedMs / 1000
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 2 : 1)} s`
  const min = Math.floor(sec / 60)
  const rem = sec - min * 60
  return `${min}m ${rem.toFixed(0)}s`
}
