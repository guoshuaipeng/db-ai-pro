/** Minimal RFC4180-ish CSV parser — no heavy dependency. */

export type CsvParseResult = {
  headers: string[]
  rows: Record<string, string>[]
}

function parseLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    const next = line[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"'
        i += 1
        continue
      }
      if (ch === '"') {
        inQuotes = false
        continue
      }
      current += ch
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      cells.push(current)
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current)
  return cells
}

function splitRecords(text: string): string[] {
  const records: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      current += ch
      if (ch === '"' && next === '"') {
        current += next
        i += 1
        continue
      }
      if (ch === '"') inQuotes = false
      continue
    }
    if (ch === '"') {
      inQuotes = true
      current += ch
      continue
    }
    if (ch === '\r' && next === '\n') {
      records.push(current)
      current = ''
      i += 1
      continue
    }
    if (ch === '\n' || ch === '\r') {
      records.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.length) records.push(current)
  return records
}

function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>()
  return raw.map((header, index) => {
    const base = header.trim() || `column_${index + 1}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}_${count + 1}`
  })
}

export function parseCsv(text: string): CsvParseResult {
  const normalized = text.replace(/^\uFEFF/, '')
  const records = splitRecords(normalized)
  if (!records.length) return { headers: [], rows: [] }
  const headers = uniqueHeaders(parseLine(records[0]))
  const rows: Record<string, string>[] = []
  for (let i = 1; i < records.length; i += 1) {
    const cells = parseLine(records[i])
    if (cells.every((cell) => cell.trim() === '')) continue
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? ''
    })
    rows.push(row)
  }
  return { headers, rows }
}
