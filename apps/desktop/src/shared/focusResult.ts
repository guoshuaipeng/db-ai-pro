/** Focus result pane affordance (M98). */

export function focusResultShortcutLabel(): string {
  return 'Ctrl+Shift+2'
}

export type FocusResultCandidates<T> = {
  grid?: T | null
  messageLog?: T | null
  pane?: T | null
}

/** Prefer grid, then message/plan log, else the result pane root. */
export function pickFocusResultTarget<T>(parts: FocusResultCandidates<T>): T | null {
  return parts.grid ?? parts.messageLog ?? parts.pane ?? null
}
