import type { Dialect } from './types'
import type { TableColumnInfo } from './tableStructure'
import { identStyle, quoteIdent } from './sql'

export type ColumnDiffKind = 'added' | 'removed' | 'changed' | 'same'

export type ColumnChangeField = 'type' | 'nullable' | 'default' | 'primaryKey'

export type ColumnDiff = {
  name: string
  kind: ColumnDiffKind
  left?: TableColumnInfo
  right?: TableColumnInfo
  changes?: ColumnChangeField[]
}

function normType(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function normDefault(value: string | null): string {
  if (value == null || value === '') return ''
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase()
}

function compareColumns(left: TableColumnInfo, right: TableColumnInfo): ColumnChangeField[] {
  const changes: ColumnChangeField[] = []
  if (normType(left.dataType) !== normType(right.dataType)) changes.push('type')
  if (Boolean(left.nullable) !== Boolean(right.nullable)) changes.push('nullable')
  if (normDefault(left.defaultValue) !== normDefault(right.defaultValue)) changes.push('default')
  if (Boolean(left.primaryKey) !== Boolean(right.primaryKey)) changes.push('primaryKey')
  return changes
}

/** Column-level diff. `added` = only on right; `removed` = only on left. */
export function diffTableColumns(left: TableColumnInfo[], right: TableColumnInfo[]): ColumnDiff[] {
  const leftMap = new Map(left.map((col) => [col.name.toLowerCase(), col]))
  const rightMap = new Map(right.map((col) => [col.name.toLowerCase(), col]))
  const names = new Set([...leftMap.keys(), ...rightMap.keys()])
  const ordered = [...names].sort((a, b) => {
    const l = leftMap.get(a)?.ordinal ?? rightMap.get(a)?.ordinal ?? 0
    const r = leftMap.get(b)?.ordinal ?? rightMap.get(b)?.ordinal ?? 0
    if (l !== r) return l - r
    return a.localeCompare(b)
  })

  return ordered.map((key) => {
    const l = leftMap.get(key)
    const r = rightMap.get(key)
    if (l && !r) return { name: l.name, kind: 'removed' as const, left: l }
    if (!l && r) return { name: r.name, kind: 'added' as const, right: r }
    const changes = compareColumns(l!, r!)
    if (changes.length === 0) return { name: l!.name, kind: 'same' as const, left: l, right: r }
    return { name: l!.name, kind: 'changed' as const, left: l, right: r, changes }
  })
}

export function summarizeDiff(diffs: ColumnDiff[]): { added: number; removed: number; changed: number; same: number } {
  const summary = { added: 0, removed: 0, changed: 0, same: 0 }
  for (const row of diffs) summary[row.kind] += 1
  return summary
}

function q(dialect: Dialect, name: string): string {
  return quoteIdent(name, identStyle(dialect))
}

function columnDef(dialect: Dialect, col: TableColumnInfo): string {
  const parts = [`${q(dialect, col.name)} ${col.dataType || 'TEXT'}`]
  if (!col.nullable && !col.primaryKey) parts.push('NOT NULL')
  if (col.defaultValue != null && col.defaultValue !== '') parts.push(`DEFAULT ${col.defaultValue}`)
  return parts.join(' ')
}

/**
 * Preview SQL to make **right/target** closer to **left/reference**.
 * Best-effort; SQLite modify/drop often commented as unsupported.
 */
export function suggestAlterSql(input: {
  dialect: Dialect
  targetTable: string
  diffs: ColumnDiff[]
}): string {
  const { dialect, targetTable, diffs } = input
  const table = q(dialect, targetTable)
  const lines: string[] = [
    `-- Schema diff preview · make ${targetTable} closer to the left/reference table`,
    `-- Review before running. Destructive statements still need confirmation in-app.`,
  ]

  for (const diff of diffs) {
    if (diff.kind === 'removed' && diff.left) {
      // left has it, right missing → ADD to target
      lines.push(`ALTER TABLE ${table} ADD ${columnDef(dialect, diff.left)};`)
      continue
    }
    if (diff.kind === 'added' && diff.right) {
      // right-only → DROP from target (dangerous)
      if (dialect === 'sqlite') {
        lines.push(`-- SQLite: DROP COLUMN may need 3.35+ / rebuild: ${diff.right.name}`)
        lines.push(`-- ALTER TABLE ${table} DROP COLUMN ${q(dialect, diff.right.name)};`)
      } else {
        lines.push(`ALTER TABLE ${table} DROP COLUMN ${q(dialect, diff.right.name)};`)
      }
      continue
    }
    if (diff.kind === 'changed' && diff.left && diff.right && diff.changes?.length) {
      const fields = diff.changes.join(', ')
      if (dialect === 'postgresql') {
        if (diff.changes.includes('type')) {
          lines.push(
            `ALTER TABLE ${table} ALTER COLUMN ${q(dialect, diff.left.name)} TYPE ${diff.left.dataType || 'text'};`,
          )
        }
        if (diff.changes.includes('nullable')) {
          lines.push(
            diff.left.nullable
              ? `ALTER TABLE ${table} ALTER COLUMN ${q(dialect, diff.left.name)} DROP NOT NULL;`
              : `ALTER TABLE ${table} ALTER COLUMN ${q(dialect, diff.left.name)} SET NOT NULL;`,
          )
        }
        if (diff.changes.includes('default')) {
          if (diff.left.defaultValue == null || diff.left.defaultValue === '') {
            lines.push(`ALTER TABLE ${table} ALTER COLUMN ${q(dialect, diff.left.name)} DROP DEFAULT;`)
          } else {
            lines.push(
              `ALTER TABLE ${table} ALTER COLUMN ${q(dialect, diff.left.name)} SET DEFAULT ${diff.left.defaultValue};`,
            )
          }
        }
        if (diff.changes.includes('primaryKey')) {
          lines.push(`-- primaryKey change for ${diff.left.name}: adjust constraints manually`)
        }
      } else if (dialect === 'mysql' || dialect === 'mariadb') {
        lines.push(`ALTER TABLE ${table} MODIFY COLUMN ${columnDef(dialect, diff.left)}; -- changed: ${fields}`)
      } else if (dialect === 'sqlserver') {
        lines.push(
          `ALTER TABLE ${table} ALTER COLUMN ${q(dialect, diff.left.name)} ${diff.left.dataType || 'nvarchar(max)'}${diff.left.nullable ? '' : ' NOT NULL'}; -- changed: ${fields}`,
        )
      } else {
        lines.push(`-- SQLite limited ALTER for ${diff.left.name} (${fields}); prefer rebuild table`)
        lines.push(`-- target: ${columnDef(dialect, diff.left)}`)
      }
    }
  }

  const actionable = lines.filter((line) => !line.startsWith('--'))
  if (actionable.length === 0) {
    lines.push('-- No automatic ALTER suggestions (tables match, or only comments).')
  }
  return lines.join('\n') + '\n'
}
