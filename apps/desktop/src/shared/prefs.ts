export type UiDensity = 'comfortable' | 'compact'

export type AppPrefs = {
  density: UiDensity
  /** Soft query timeout in seconds. 0 = no timeout. Default 30. */
  queryTimeoutSec: number
}

export const DEFAULT_PREFS: AppPrefs = {
  density: 'comfortable',
  queryTimeoutSec: 30,
}

const TIMEOUT_MIN = 0
const TIMEOUT_MAX = 600

export function clampQueryTimeoutSec(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_PREFS.queryTimeoutSec
  return Math.min(TIMEOUT_MAX, Math.max(TIMEOUT_MIN, Math.round(n)))
}

export function normalizePrefs(value: unknown): AppPrefs {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PREFS }
  const row = value as Partial<AppPrefs>
  return {
    density: row.density === 'compact' ? 'compact' : 'comfortable',
    queryTimeoutSec: clampQueryTimeoutSec(
      row.queryTimeoutSec === undefined ? DEFAULT_PREFS.queryTimeoutSec : row.queryTimeoutSec,
    ),
  }
}
