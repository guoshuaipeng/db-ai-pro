/** Show / hide result-grid columns (at least one remains visible). */

/** Columns eligible for the grid (hide internal __rowid__). */
export function baseResultColumns(columns: string[]): string[] {
  const visible = columns.filter((column) => column !== '__rowid__')
  return visible.length > 0 ? visible : [...columns]
}

export function hiddenSet(hidden: readonly string[]): Set<string> {
  return new Set(hidden)
}

/** Columns currently shown, preserving `columns` order. */
export function visibleResultColumns(columns: string[], hidden: readonly string[]): string[] {
  const hide = hiddenSet(hidden)
  const base = baseResultColumns(columns)
  const shown = base.filter((column) => !hide.has(column))
  return shown.length > 0 ? shown : base.slice(0, 1)
}

export function countHiddenColumns(columns: string[], hidden: readonly string[]): number {
  const base = new Set(baseResultColumns(columns))
  let n = 0
  for (const name of hidden) {
    if (base.has(name)) n += 1
  }
  return n
}

/** True when hiding `column` would still leave ≥1 visible. */
export function canHideColumn(columns: string[], hidden: readonly string[], column: string): boolean {
  const base = baseResultColumns(columns)
  if (!base.includes(column)) return false
  const next = new Set(hidden)
  next.add(column)
  return base.some((name) => !next.has(name))
}

/**
 * Toggle hide flag. Refuses to hide the last visible column (returns previous hidden).
 * Showing a column always succeeds.
 */
export function setColumnHidden(
  columns: string[],
  hidden: readonly string[],
  column: string,
  hide: boolean,
): string[] {
  const base = new Set(baseResultColumns(columns))
  if (!base.has(column)) return [...hidden]
  if (!hide) return hidden.filter((name) => name !== column)
  if (!canHideColumn(columns, hidden, column)) return [...hidden]
  if (hidden.includes(column)) return [...hidden]
  return [...hidden, column]
}

/** Drop hidden names that are no longer in the result. */
export function pruneHiddenColumns(columns: string[], hidden: readonly string[]): string[] {
  const base = new Set(baseResultColumns(columns))
  return hidden.filter((name) => base.has(name))
}

export function resetHiddenColumns(): string[] {
  return []
}
