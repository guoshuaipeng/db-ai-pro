/** Lightweight heuristics for turning a result grid into a chart series. */

export type ChartSeries = {
  key: string
  values: number[]
}

export type ChartModel = {
  ok: true
  labels: string[]
  series: ChartSeries[]
  labelColumn: string | null
  truncated: boolean
  rowCount: number
}

export type ChartSkip = {
  ok: false
  reason: string
}

export type ChartAnalysis = ChartModel | ChartSkip

const MAX_POINTS = 120
const MAX_SERIES = 4

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function isMostlyNumeric(rows: Record<string, unknown>[], key: string): boolean {
  let numeric = 0
  let seen = 0
  for (const row of rows) {
    const value = row[key]
    if (value == null || value === '') continue
    seen += 1
    if (toNumber(value) != null) numeric += 1
  }
  return seen > 0 && numeric / seen >= 0.8
}

function isLabelish(rows: Record<string, unknown>[], key: string): boolean {
  if (isMostlyNumeric(rows, key)) return false
  let seen = 0
  for (const row of rows) {
    const value = row[key]
    if (value == null || value === '') continue
    seen += 1
    if (typeof value === 'object') return false
  }
  return seen > 0
}

function formatLabel(value: unknown, index: number): string {
  if (value == null || value === '') return String(index + 1)
  if (typeof value === 'object') return String(index + 1)
  const text = String(value)
  return text.length > 24 ? `${text.slice(0, 22)}…` : text
}

/** Decide whether a result set can render as bar/line chart; skip gracefully otherwise. */
export function analyzeChartData(
  columns: string[],
  rows: Record<string, unknown>[],
): ChartAnalysis {
  const visible = columns.filter((column) => column !== '__rowid__')
  if (!rows.length) return { ok: false, reason: '没有数据行' }
  if (!visible.length) return { ok: false, reason: '没有可绘制的列' }

  const numericKeys = visible.filter((column) => isMostlyNumeric(rows, column))
  if (!numericKeys.length) return { ok: false, reason: '没有数值列，无法绘图' }

  const labelColumn = visible.find((column) => isLabelish(rows, column)) ?? null
  const truncated = rows.length > MAX_POINTS
  const slice = rows.slice(0, MAX_POINTS)
  const labels = slice.map((row, index) =>
    labelColumn ? formatLabel(row[labelColumn], index) : String(index + 1),
  )

  const seriesKeys = numericKeys.slice(0, MAX_SERIES)
  const series: ChartSeries[] = seriesKeys.map((key) => ({
    key,
    values: slice.map((row) => toNumber(row[key]) ?? 0),
  }))

  return {
    ok: true,
    labels,
    series,
    labelColumn,
    truncated,
    rowCount: rows.length,
  }
}

export function canChartResult(columns: string[], rows: Record<string, unknown>[]): boolean {
  return analyzeChartData(columns, rows).ok
}
