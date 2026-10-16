/** Read-only full-text preview for result cells. */

export type CellPreviewPayload = {
  /** Text shown in the modal (pretty JSON when applicable). */
  text: string
  /** Whether text was pretty-printed as JSON. */
  jsonPretty: boolean
  /** Raw null / empty marker for UI. */
  isNull: boolean
}

function tryPrettyJson(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length < 2) return null
  const start = trimmed[0]
  if (start !== '{' && start !== '[') return null
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed === null || typeof parsed !== 'object') return null
    return JSON.stringify(parsed, null, 2)
  } catch {
    return null
  }
}

/** Build preview text from a cell value (no DB write). */
export function buildCellPreview(value: unknown): CellPreviewPayload {
  if (value == null) {
    return { text: 'NULL', jsonPretty: false, isNull: true }
  }
  if (typeof value === 'object' && value && 'type' in value && (value as { type?: string }).type === 'blob') {
    return { text: '二进制', jsonPretty: false, isNull: false }
  }
  if (typeof value === 'string') {
    const pretty = tryPrettyJson(value)
    if (pretty != null) return { text: pretty, jsonPretty: true, isNull: false }
    return { text: value, jsonPretty: false, isNull: false }
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return { text: String(value), jsonPretty: false, isNull: false }
  }
  try {
    const pretty = JSON.stringify(value, null, 2)
    return { text: pretty, jsonPretty: true, isNull: false }
  } catch {
    return { text: String(value), jsonPretty: false, isNull: false }
  }
}

export function cellPreviewTitle(column: string, rowIndex: number): string {
  return `单元格 · ${column} · 第 ${rowIndex + 1} 行`
}
