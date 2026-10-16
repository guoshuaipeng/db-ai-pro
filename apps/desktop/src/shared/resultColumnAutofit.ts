/** Estimate result-grid column widths from header + sampled cell text (no DOM). */

export const AUTOFIT_SAMPLE_ROWS = 200
export const AUTOFIT_MIN_PX = 56
export const AUTOFIT_MAX_PX = 480
/** Default width when a column has not been sized yet. */
export const DEFAULT_COLUMN_WIDTH_PX = 140
/** Manual drag-resize may go wider than autofit. */
export const MANUAL_COLUMN_MAX_PX = 720
/** Cell horizontal padding (12+12) + small slack. */
export const AUTOFIT_PAD_PX = 28
/** Header pin / sort controls beside the title. */
export const AUTOFIT_HEADER_EXTRA_PX = 40

/** Approximate rendered width for UI font (~12–13px). CJK wider than Latin. */
export function measureTextWidthPx(text: string): number {
  let width = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code === 0) continue
    // CJK / fullwidth / emoji-ish
    if (code > 0xff) width += 13
    else if (code < 32) width += 0
    else if (ch >= 'A' && ch <= 'Z') width += 8
    else width += 7.2
  }
  return width
}

/** Display-ish text for width sampling (aligns with formatCell null glyph). */
export function cellTextForAutofit(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value)
    return String(value)
  }
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  if (typeof value === 'object' && value && 'type' in value && (value as { type?: string }).type === 'blob') {
    return '二进制'
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export type AutofitOptions = {
  sampleRows?: number
  minPx?: number
  maxPx?: number
}

function clampWidth(raw: number, minPx: number, maxPx: number): number {
  return Math.min(maxPx, Math.max(minPx, Math.ceil(raw)))
}

/** Clamp a dragged / typed column width for the result grid. */
export function clampColumnWidthPx(
  raw: number,
  options?: { minPx?: number; maxPx?: number },
): number {
  const minPx = options?.minPx ?? AUTOFIT_MIN_PX
  const maxPx = options?.maxPx ?? MANUAL_COLUMN_MAX_PX
  if (!Number.isFinite(raw)) return minPx
  return clampWidth(raw, minPx, maxPx)
}

/** Width for one column from header + up to sampleRows cells. */
export function estimateColumnWidthPx(
  column: string,
  rows: Record<string, unknown>[],
  options?: AutofitOptions,
): number {
  const sampleRows = options?.sampleRows ?? AUTOFIT_SAMPLE_ROWS
  const minPx = options?.minPx ?? AUTOFIT_MIN_PX
  const maxPx = options?.maxPx ?? AUTOFIT_MAX_PX

  let maxContent = measureTextWidthPx(column) + AUTOFIT_HEADER_EXTRA_PX
  const limit = Math.min(rows.length, Math.max(0, sampleRows))
  for (let i = 0; i < limit; i += 1) {
    const text = cellTextForAutofit(rows[i]?.[column])
    // Cap extremely long cells so one outlier does not dominate before max clamp
    const clipped = text.length > 80 ? `${text.slice(0, 80)}…` : text
    maxContent = Math.max(maxContent, measureTextWidthPx(clipped))
  }
  return clampWidth(maxContent + AUTOFIT_PAD_PX, minPx, maxPx)
}

/** Map of column → width for all given columns. */
export function estimateAllColumnWidths(
  columns: string[],
  rows: Record<string, unknown>[],
  options?: AutofitOptions,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const column of columns) {
    out[column] = estimateColumnWidthPx(column, rows, options)
  }
  return out
}
