/** Build clipboard text for object-tree identifiers (M82). */

import type { Dialect } from './types'
import { quoteIdentIfNeeded } from './sql'
import { qualifyBrowseTable } from './tablePaging'

export function treeTableCopyText(
  dialect: Dialect | string,
  tableName: string,
  databaseName?: string | null,
): string {
  const raw = tableName.trim()
  if (!raw) return ''
  return qualifyBrowseTable(dialect as Dialect, raw, databaseName)
}

export function treeColumnCopyText(dialect: Dialect | string, columnName: string): string {
  const raw = columnName.trim()
  if (!raw) return ''
  return quoteIdentIfNeeded(raw, dialect)
}

export function treeDatabaseCopyText(dialect: Dialect | string, databaseName: string): string {
  const raw = databaseName.trim()
  if (!raw) return ''
  return quoteIdentIfNeeded(raw, dialect)
}

export function treeIdentCopiedToast(text: string): string {
  const clipped = text.length > 48 ? `${text.slice(0, 47)}…` : text
  return `已复制 ${clipped}`
}
