import { clampSlowQueryMs, DEFAULT_SLOW_QUERY_MS } from './slowQuery'

export const DEFAULT_ZOOM_FACTOR = 1
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 2
export const ZOOM_STEP = 0.1

export function clampZoomFactor(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_ZOOM_FACTOR
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n))
  return Math.round(clamped * 100) / 100
}

export function formatZoomPercent(factor: number): string {
  return `${Math.round(clampZoomFactor(factor) * 100)}%`
}

export function stepZoomFactor(factor: number, direction: 1 | -1): number {
  return clampZoomFactor(factor + direction * ZOOM_STEP)
}

export const DEFAULT_EDITOR_FONT_SIZE = 13
export const EDITOR_FONT_MIN = 12
export const EDITOR_FONT_MAX = 20

export function clampEditorFontSize(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_EDITOR_FONT_SIZE
  return Math.min(EDITOR_FONT_MAX, Math.max(EDITOR_FONT_MIN, Math.round(n)))
}

export function editorLineHeight(fontSize: number): number {
  return Math.round(clampEditorFontSize(fontSize) * 1.7)
}

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
  /** Keep main window above others. */
  alwaysOnTop: boolean
  /** webContents zoomFactor (1 = 100%). */
  zoomFactor: number
  /** Only record errors/warnings in the notification center. */
  notifyOnErrorOnly: boolean
  /** Record a notification when a run exceeds slowQueryMs. */
  notifyOnSlowQuery: boolean
  /** Monaco minimap. Default off for SQL editing focus. */
  editorMinimap: boolean
  /** Monaco editor font size (12–20). */
  editorFontSize: number
  /** Monaco soft wrap. Default off (SQL prefers horizontal scroll). */
  editorWordWrap: boolean
  /** Hide full-workspace welcome when there are no connections. */
  welcomeDismissed: boolean
}

export const DEFAULT_PREFS: AppPrefs = {
  density: 'comfortable',
  highContrast: false,
  queryTimeoutSec: 30,
  restoreTabsOnLaunch: true,
  globalReadOnly: false,
  slowQueryMs: DEFAULT_SLOW_QUERY_MS,
  alwaysOnTop: false,
  zoomFactor: DEFAULT_ZOOM_FACTOR,
  notifyOnErrorOnly: false,
  notifyOnSlowQuery: false,
  editorMinimap: false,
  editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
  editorWordWrap: false,
  welcomeDismissed: false,
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
    alwaysOnTop: row.alwaysOnTop === true,
    zoomFactor: clampZoomFactor(
      row.zoomFactor === undefined ? DEFAULT_ZOOM_FACTOR : row.zoomFactor,
    ),
    notifyOnErrorOnly: row.notifyOnErrorOnly === true,
    notifyOnSlowQuery: row.notifyOnSlowQuery === true,
    editorMinimap: row.editorMinimap === true,
    editorFontSize: clampEditorFontSize(
      row.editorFontSize === undefined ? DEFAULT_EDITOR_FONT_SIZE : row.editorFontSize,
    ),
    editorWordWrap: row.editorWordWrap === true,
    welcomeDismissed: row.welcomeDismissed === true,
  }
}
