export function splitSql(input: string): string[] {
  const statements: string[] = []
  let current = ''
  let quote: "'" | '"' | '`' | null = null
  let i = 0

  while (i < input.length) {
    const char = input[i]
    const next = input[i + 1]

    if (!quote && char === '-' && next === '-') {
      const end = input.indexOf('\n', i)
      const chunk = end === -1 ? input.slice(i) : input.slice(i, end + 1)
      current += chunk
      i += chunk.length
      continue
    }

    if (!quote && char === '/' && next === '*') {
      const end = input.indexOf('*/', i + 2)
      const chunk = end === -1 ? input.slice(i) : input.slice(i, end + 2)
      current += chunk
      i += chunk.length
      continue
    }

    if (quote) {
      current += char
      if (char === quote) {
        if (next === quote) {
          current += next
          i += 2
          continue
        }
        quote = null
      }
      i += 1
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char
      current += char
      i += 1
      continue
    }

    if (char === ';') {
      if (current.trim()) statements.push(current.trim())
      current = ''
      i += 1
      continue
    }

    current += char
    i += 1
  }

  if (current.trim()) statements.push(current.trim())
  return statements
}

export function statementTitle(sql: string, index: number): string {
  const match = sql.match(/^\s*--\s*(.+)$/m)
  if (match?.[1]) return match[1].trim()
  return `结果 ${index + 1}`
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export function selectAll(table: string): string {
  return `SELECT *\nFROM ${quoteIdent(table)}\nLIMIT 200;`
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'sql'; text: string; closed: boolean }

export function parseBlocks(input: string): ContentBlock[] {
  const parts: ContentBlock[] = []
  const pattern = /```sql\s*([\s\S]*?)```/gi
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(input))) {
    const before = input.slice(last, match.index).trim()
    if (before) parts.push({ type: 'text', text: before })
    parts.push({ type: 'sql', text: match[1].trim(), closed: true })
    last = match.index + match[0].length
  }

  const rest = input.slice(last)
  const open = rest.match(/```sql\s*([\s\S]*)$/i)
  if (open && open.index !== undefined) {
    const before = rest.slice(0, open.index).trim()
    if (before) parts.push({ type: 'text', text: before })
    parts.push({ type: 'sql', text: open[1].replace(/```$/, '').trim(), closed: false })
  } else if (rest.trim()) {
    parts.push({ type: 'text', text: rest.trim() })
  }

  return parts
}

export function extractSql(text: string): string | null {
  const blocks = parseBlocks(text).filter((block) => block.type === 'sql' && block.closed)
  const last = blocks[blocks.length - 1]
  return last && last.type === 'sql' ? last.text : null
}
