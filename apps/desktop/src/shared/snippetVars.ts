/** Snippet placeholders: {{table}}, {{limit}}, … */

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

export function extractSnippetVars(sql: string): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  for (const match of sql.matchAll(VAR_RE)) {
    const name = match[1]
    if (!seen.has(name)) {
      seen.add(name)
      order.push(name)
    }
  }
  return order
}

export function hasSnippetVars(sql: string): boolean {
  return extractSnippetVars(sql).length > 0
}

/** Replace {{name}} with values; missing keys become empty string. */
export function expandSnippet(sql: string, values: Record<string, string>): string {
  return sql.replace(VAR_RE, (_full, name: string) => values[name] ?? '')
}

export function defaultSnippetValues(
  vars: string[],
  hints?: { table?: string | null; limit?: string | null; column?: string | null },
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const name of vars) {
    if ((name === 'table' || name === 'tables') && hints?.table) next[name] = hints.table
    else if (name === 'limit') next[name] = hints?.limit ?? '100'
    else if ((name === 'column' || name === 'columns') && hints?.column) next[name] = hints.column
    else if (name === 'id') next[name] = '1'
    else next[name] = ''
  }
  return next
}
