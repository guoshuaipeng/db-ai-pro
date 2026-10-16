/** Pick which SQL text to execute when the editor may have a selection (M75). */

export type RunSqlPick = {
  sql: string
  fromSelection: boolean
}

/**
 * Prefer a non-empty selection; otherwise the full buffer.
 * Trims the selection edges but preserves internal whitespace.
 */
export function pickRunSql(fullSql: string, selectionSql?: string | null): RunSqlPick {
  const full = fullSql ?? ''
  const selected = selectionSql?.replace(/^\s+/, '').replace(/\s+$/, '') ?? ''
  if (selected.length > 0) {
    return { sql: selected, fromSelection: true }
  }
  return { sql: full, fromSelection: false }
}

/** True when Monaco reports a non-empty range selection. */
export function selectionIsNonEmpty(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): boolean {
  return startLine !== endLine || startColumn !== endColumn
}