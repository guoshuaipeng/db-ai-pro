/** Pointer delta → pane size helpers (1:1 CSS-pixel tracking). */

import { clampAiWidth, clampEditorRatio, clampSidebarWidth } from './layoutBounds'

/** Sidebar/AI widths are CSS px; pointer clientX/Y are CSS px under Electron zoom — add 1:1. */
export function applyWidthDelta(width: number, deltaPx: number): number {
  return clampSidebarWidth(width + deltaPx)
}

export function applyAiWidthDelta(width: number, deltaPx: number): number {
  return clampAiWidth(width + deltaPx)
}

/**
 * Editor/results use `ratio fr` vs `1fr`. Convert a vertical pointer delta (CSS px)
 * into a ratio delta so the splitter tracks the mouse 1:1 along the stage track.
 *
 * editorHeight ≈ track * ratio / (ratio + 1)
 * d(height)/d(ratio) = track / (ratio + 1)^2
 * ⇒ d(ratio) = d(height) * (ratio + 1)^2 / track
 */
export function applyEditorRatioPointerDelta(
  ratio: number,
  deltaPx: number,
  trackPx: number,
): number {
  const track = Math.max(1, trackPx)
  const r = Number.isFinite(ratio) ? ratio : 1
  const next = r + (deltaPx * (r + 1) ** 2) / track
  return clampEditorRatio(next)
}
