/** Parse / clamp editor go-to-line input (M80). */

export type GotoLineTarget = { line: number; column: number }

/** Accept `12`, `12:5`, `12,5`, `12，5`, or `12 5`. */
export function parseGotoLineInput(raw: string): GotoLineTarget | null {
  const s = raw.trim()
  if (!s) return null
  const paired =
    s.match(/^(\d+)\s*[:：,，]\s*(\d+)\s*$/) || s.match(/^(\d+)\s+(\d+)\s*$/)
  const single = paired ? null : s.match(/^(\d+)\s*$/)
  const m = paired ?? single
  if (!m) return null
  const line = Number(m[1])
  const column = m[2] != null ? Number(m[2]) : 1
  if (!Number.isFinite(line) || line < 1 || !Number.isFinite(column) || column < 1) return null
  return { line: Math.floor(line), column: Math.floor(column) }
}

export function clampGotoLineTarget(
  target: GotoLineTarget,
  lineCount: number,
  lineMaxColumn: (line: number) => number,
): GotoLineTarget {
  const safeCount = Math.max(1, Math.floor(lineCount) || 1)
  const line = Math.min(Math.max(1, target.line), safeCount)
  const maxCol = Math.max(1, Math.floor(lineMaxColumn(line)) || 1)
  const column = Math.min(Math.max(1, target.column), maxCol)
  return { line, column }
}

/** Prefill for the dialog from current cursor. */
export function formatGotoLineSeed(line: number, column: number): string {
  const ln = Math.max(1, Math.floor(line) || 1)
  const col = Math.max(1, Math.floor(column) || 1)
  return col <= 1 ? String(ln) : `${ln}:${col}`
}
