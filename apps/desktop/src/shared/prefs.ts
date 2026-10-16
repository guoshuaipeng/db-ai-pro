export type UiDensity = 'comfortable' | 'compact'

export type AppPrefs = {
  density: UiDensity
  /** Stronger borders / text for accessibility. */
  highContrast: boolean
  /** Soft query timeout in seconds. 0 = no timeout. Default 30. */
  queryTimeoutSec: number
  /** Restore query tabs from last session on launch. Default on. */
  restoreTabsOnLaunch: boolean
}

export const DEFAULT_PREFS: AppPrefs = {
  density: 'comfortable',
  highContrast: false,
  queryTimeoutSec: 30,
  restoreTabsOnLaunch: true,
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
    highContrast: row.highContrast === true,
    queryTimeoutSec: clampQueryTimeoutSec(
      row.queryTimeoutSec === undefined ? DEFAULT_PREFS.queryTimeoutSec : row.queryTimeoutSec,
    ),
    restoreTabsOnLaunch: row.restoreTabsOnLaunch !== false,
  }
}
