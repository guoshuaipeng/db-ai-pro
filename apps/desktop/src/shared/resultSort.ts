/** Client-side column sort for result grids. */

export type SortDirection = 'asc' | 'desc'

export type ResultSort = {
  column: string
  direction: SortDirection
}

function cellSortKey(value: unknown): { kind: 'null' | 'number' | 'string'; number?: number; string?: string } {
  if (value == null) return { kind: 'null' }
  if (typeof value === 'number' && Number.isFinite(value)) return { kind: 'number', number: value }
  if (typeof value === 'boolean') return { kind: 'number', number: value ? 1 : 0 }
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  const asNum = Number(text)
  if (text.trim() !== '' && Number.isFinite(asNum) && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text.trim())) {
    return { kind: 'number', number: asNum }
  }
  return { kind: 'string', string: text.toLowerCase() }
}

function compareValues(a: unknown, b: unknown): number {
  const ka = cellSortKey(a)
  const kb = cellSortKey(b)
  if (ka.kind === 'null' && kb.kind === 'null') return 0
  if (ka.kind === 'null') return 1
  if (kb.kind === 'null') return -1
  if (ka.kind === 'number' && kb.kind === 'number') return (ka.number ?? 0) - (kb.number ?? 0)
  if (ka.kind === 'number' && kb.kind === 'string') return -1
  if (ka.kind === 'string' && kb.kind === 'number') return 1
  return (ka.string ?? '').localeCompare(kb.string ?? '', 'zh-CN', { numeric: true, sensitivity: 'base' })
}

export function sortResultRows(
  rows: Record<string, unknown>[],
  sort: ResultSort | null | undefined,
): Record<string, unknown>[] {
  if (!sort?.column) return rows
  const { column, direction } = sort
  const indexed = rows.map((row, index) => ({ row, index }))
  indexed.sort((a, b) => {
    const cmp = compareValues(a.row[column], b.row[column])
    if (cmp !== 0) return direction === 'asc' ? cmp : -cmp
    return a.index - b.index
  })
  return indexed.map((item) => item.row)
}

/** Cycle: none → asc → desc → none */
export function nextSortState(current: ResultSort | null, column: string): ResultSort | null {
  if (!current || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}
