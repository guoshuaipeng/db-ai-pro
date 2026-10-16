import type { TableSpec } from '@shared/schema'

/** Parse `describeSchema` lines like `customers (id INTEGER, name TEXT)`. */
export function tablesFromDescribe(text: string): TableSpec[] {
  const tables: TableSpec[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^([^\s(]+)\s*\((.*)\)\s*$/)
    if (!match) continue
    const name = match[1]
    const body = match[2] ?? ''
    const columns = body
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const bits = part.split(/\s+/)
        const columnName = bits[0] ?? part
        const dataType = bits.slice(1).join(' ') || 'TEXT'
        return { name: columnName, dataType }
      })
    tables.push({ name, columns })
  }
  return tables
}
