/** Pane layout clamps sized for ~1366×768 and up. */

export const LAYOUT = {
  sidebarMin: 200,
  sidebarMax: 400,
  sidebarDefault: 252,
  aiMin: 280,
  aiMax: 480,
  aiDefault: 360,
  /** CSS fr weight for editor vs results row. */
  editorRatioMin: 0.55,
  editorRatioMax: 3.0,
  editorRatioDefault: 1.35,
  /** Stage row mins (px) kept usable on short screens. */
  editorMinPx: 160,
  resultsMinPx: 140,
} as const

function finite(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function clampSidebarWidth(value: unknown): number {
  const n = finite(value, LAYOUT.sidebarDefault)
  return Math.min(LAYOUT.sidebarMax, Math.max(LAYOUT.sidebarMin, Math.round(n)))
}

export function clampAiWidth(value: unknown): number {
  const n = finite(value, LAYOUT.aiDefault)
  return Math.min(LAYOUT.aiMax, Math.max(LAYOUT.aiMin, Math.round(n)))
}

export function clampEditorRatio(value: unknown): number {
  const n = finite(value, LAYOUT.editorRatioDefault)
  const clamped = Math.min(LAYOUT.editorRatioMax, Math.max(LAYOUT.editorRatioMin, n))
  return Math.round(clamped * 1000) / 1000
}

export type LayoutSlice = {
  sidebarWidth: number
  aiWidth: number
  editorRatio: number
  sidebarOpen: boolean
  aiOpen: boolean
}

export function normalizeLayout(raw: Partial<LayoutSlice> | null | undefined): LayoutSlice {
  return {
    sidebarWidth: clampSidebarWidth(raw?.sidebarWidth),
    aiWidth: clampAiWidth(raw?.aiWidth),
    editorRatio: clampEditorRatio(raw?.editorRatio),
    sidebarOpen: raw?.sidebarOpen !== false,
    aiOpen: raw?.aiOpen === true,
  }
}
