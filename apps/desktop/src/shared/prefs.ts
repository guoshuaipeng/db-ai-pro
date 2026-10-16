import { clampSlowQueryMs, DEFAULT_SLOW_QUERY_MS } from './slowQuery'

export type UiDensity = 'comfortable' | 'compact'

export type AppPrefs = {
  density: UiDensity
  /** Stronger borders / text for accessibility. */
  highContrast: boolean
  /** Soft query timeout in seconds. 0 = no timeout. Default 30. */
  queryTimeoutSec: number
  /** Restore query tabs from last session on launch. Default on. */
  restoreTabsOnLaunch: boolean
  /** Global safe mode: block writes / DDL on every connection. */
  globalReadOnly: boolean
  /** Mark runs slower than this many ms as 慢. Default 1000. */
  slowQueryMs: number
}

export const DEFAULT_PREFS: AppPrefs = {
  density: 'comfortable',
  highContrast: false,
  queryTimeoutSec: 30,
  restoreTabsOnLaunch: true,
  globalReadOnly: false,
  slowQueryMs: DEFAULT_SLOW_QUERY_MS,
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
    globalReadOnly: row.globalReadOnly === true,
    slowQueryMs: clampSlowQueryMs(
      row.slowQueryMs === undefined ? DEFAULT_SLOW_QUERY_MS : row.slowQueryMs,
    ),
  }
}
