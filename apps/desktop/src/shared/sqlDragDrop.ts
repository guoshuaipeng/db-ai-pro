/** HTML5 drag payload for dropping SQL / idents into the editor. */

export const DATAAI_SQL_DRAG_TYPE = 'application/x-dataai-sql'

export type SqlDragSource = 'favorite' | 'history' | 'object'

export type SqlDragPayload = {
  text: string
  source: SqlDragSource
}

/** Minimal DataTransfer surface so shared/ can typecheck without DOM lib. */
export type SqlDataTransfer = {
  setData: (format: string, data: string) => void
  getData: (format: string) => string
  effectAllowed: string
  dropEffect?: string
  types?: readonly string[] | { [index: number]: string; length: number; item?: (i: number) => string | null }
}

export function encodeSqlDragPayload(payload: SqlDragPayload): string {
  return JSON.stringify({
    text: payload.text,
    source: payload.source,
  })
}

export function decodeSqlDragPayload(raw: string | undefined | null): SqlDragPayload | null {
  if (!raw || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw) as Partial<SqlDragPayload>
    if (!parsed || typeof parsed.text !== 'string' || !parsed.text) return null
    const source = parsed.source
    if (source !== 'favorite' && source !== 'history' && source !== 'object') return null
    return { text: parsed.text, source }
  } catch {
    return null
  }
}

/** True when the drag carries our SQL mime or plain text. */
export function isSqlDragEvent(types: readonly string[] | { [index: number]: string; length: number }): boolean {
  const list = Array.from(types as ArrayLike<string>)
  return list.includes(DATAAI_SQL_DRAG_TYPE) || list.includes('text/plain')
}

export function setSqlDragData(
  dataTransfer: SqlDataTransfer,
  text: string,
  source: SqlDragSource,
): void {
  const trimmed = text.trim()
  if (!trimmed) return
  const payload: SqlDragPayload = { text: trimmed, source }
  dataTransfer.setData(DATAAI_SQL_DRAG_TYPE, encodeSqlDragPayload(payload))
  dataTransfer.setData('text/plain', trimmed)
  dataTransfer.effectAllowed = 'copy'
}

/** Prefer typed payload; fall back to text/plain. */
export function readSqlDragText(dataTransfer: SqlDataTransfer): string | null {
  const typed = decodeSqlDragPayload(dataTransfer.getData(DATAAI_SQL_DRAG_TYPE))
  if (typed?.text) return typed.text
  const plain = dataTransfer.getData('text/plain')?.trim()
  return plain || null
}
