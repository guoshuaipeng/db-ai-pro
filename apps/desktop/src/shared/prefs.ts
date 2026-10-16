export type UiDensity = 'comfortable' | 'compact'

export type AppPrefs = {
  density: UiDensity
}

export const DEFAULT_PREFS: AppPrefs = {
  density: 'comfortable',
}

export function normalizePrefs(value: unknown): AppPrefs {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PREFS }
  const row = value as Partial<AppPrefs>
  return {
    density: row.density === 'compact' ? 'compact' : 'comfortable',
  }
}
