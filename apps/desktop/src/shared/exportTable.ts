/** Table export helpers (CSV / JSON / Markdown / HTML). */

/** Soft cap for Excel / Markdown / HTML exports to keep files manageable. */
export const EXPORT_ROW_CAP = 50_000

export function capExportRows<T>(rows: T[], cap = EXPORT_ROW_CAP): { rows: T[]; truncated: boolean; total: number } {
  const total = rows.length
  if (total <= cap) return { rows, truncated: false, total }
  return { rows: rows.slice(0, cap), truncated: true, total }
}

function cellText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function rowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const escape = (value: unknown): string => {
    const text = cellText(value)
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
    return text
  }
  const lines = [columns.map(escape).join(',')]
  for (const row of rows) {
    lines.push(columns.map((column) => escape(row[column])).join(','))
  }
  return `${lines.join('\n')}\n`
}

export function rowsToJson(columns: string[], rows: Record<string, unknown>[]): string {
  const cleaned = rows.map((row) => {
    const next: Record<string, unknown> = {}
    for (const column of columns) next[column] = row[column] ?? null
    return next
  })
  return `${JSON.stringify(cleaned, null, 2)}\n`
}

function escapeMdCell(value: unknown): string {
  return cellText(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
}

/** GitHub-flavored Markdown table. */
export function rowsToMarkdown(columns: string[], rows: Record<string, unknown>[]): string {
  if (columns.length === 0) return '\n'
  const header = `| ${columns.map(escapeMdCell).join(' | ')} |`
  const sep = `| ${columns.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${columns.map((column) => escapeMdCell(row[column])).join(' | ')} |`)
  return `${[header, sep, ...body].join('\n')}\n`
}

function escapeHtml(value: unknown): string {
  return cellText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Minimal dark-friendly HTML document with a plain table. */
export function rowsToHtml(columns: string[], rows: Record<string, unknown>[], title = 'DataAI 结果'): string {
  const head = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')
  const body = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`)
    .join('\n')
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 24px; background: #0c0e13; color: #e8edf7; font: 13px/1.5 system-ui, sans-serif; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #2a3142; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #141924; color: #a8b0c2; font-weight: 600; }
  tr:nth-child(even) td { background: #10141c; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${rows.length.toLocaleString('zh-CN')} 行 · ${columns.length} 列</p>
<table>
<thead><tr>${head}</tr></thead>
<tbody>
${body}
</tbody>
</table>
</body>
</html>
`
}
