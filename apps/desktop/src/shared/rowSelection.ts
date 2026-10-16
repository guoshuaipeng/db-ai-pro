/** Row multi-select helpers for result grids (index into current display rows). */

export function toggleRowIndex(selected: ReadonlySet<number>, index: number): Set<number> {
  const next = new Set(selected)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  return next
}

/** Inclusive range from anchor to target; replaces selection. */
export function rangeRowIndexes(anchor: number, target: number): Set<number> {
  const lo = Math.min(anchor, target)
  const hi = Math.max(anchor, target)
  const next = new Set<number>()
  for (let i = lo; i <= hi; i += 1) next.add(i)
  return next
}

export function selectAllRowIndexes(count: number): Set<number> {
  const next = new Set<number>()
  for (let i = 0; i < count; i += 1) next.add(i)
  return next
}

export function selectedRowsFromIndexes<T>(
  rows: readonly T[],
  selected: ReadonlySet<number>,
): T[] {
  const indexes = [...selected].filter((i) => i >= 0 && i < rows.length).sort((a, b) => a - b)
  return indexes.map((i) => rows[i]!)
}
