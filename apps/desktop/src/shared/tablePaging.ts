/** Table browse pagination (LIMIT/OFFSET or engine equivalent). */

import { identStyle, quoteIdent, type IdentStyle } from './sql'
import type { Dialect } from './types'

export const PAGE_SIZES = [100, 500, 1000] as const
export type PageSize = (typeof PAGE_SIZES)[number]
export const DEFAULT_PAGE_SIZE: PageSize = 100

export type TableBrowseState = {
  connectionId: string
  tableName: string
  /** Instance database / schema for multi-DB trees (MySQL schema, MSSQL DB, PG DB). */
  databaseName?: string
  /** 0-based page index */
  page: number
  pageSize: PageSize
  /** Total row count when known; null while loading / unknown */
  totalRows?: number | null
}

export function normalizePageSize(raw: unknown, fallback: PageSize = DEFAULT_PAGE_SIZE): PageSize {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if ((PAGE_SIZES as readonly number[]).includes(n)) return n as PageSize
  return fallback
}

export function normalizeBrowseState(raw: unknown): TableBrowseState | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Partial<TableBrowseState>
  if (typeof row.connectionId !== 'string' || !row.connectionId.trim()) return undefined
  if (typeof row.tableName !== 'string' || !row.tableName.trim()) return undefined
  const page = typeof row.page === 'number' && Number.isFinite(row.page) && row.page >= 0
    ? Math.floor(row.page)
    : 0
  const pageSize = normalizePageSize(row.pageSize)
  const totalRows =
    row.totalRows === undefined || row.totalRows === null
      ? null
      : typeof row.totalRows === 'number' && Number.isFinite(row.totalRows) && row.totalRows >= 0
        ? Math.floor(row.totalRows)
        : null
  const databaseName =
    typeof row.databaseName === 'string' && row.databaseName.trim()
      ? row.databaseName.trim()
      : undefined
  return {
    connectionId: row.connectionId.trim(),
    tableName: row.tableName.trim(),
    ...(databaseName ? { databaseName } : {}),
    page,
    pageSize,
    totalRows,
  }
}

export function pageOffset(page: number, pageSize: PageSize): number {
  return Math.max(0, Math.floor(page)) * pageSize
}

export function pageCount(totalRows: number | null | undefined, pageSize: PageSize): number | null {
  if (totalRows == null || totalRows < 0) return null
  if (totalRows === 0) return 1
  return Math.max(1, Math.ceil(totalRows / pageSize))
}

export function clampBrowsePage(browse: TableBrowseState): TableBrowseState {
  const pages = pageCount(browse.totalRows ?? null, browse.pageSize)
  if (pages == null) return { ...browse, page: Math.max(0, browse.page) }
  const page = Math.min(Math.max(0, browse.page), pages - 1)
  return page === browse.page ? browse : { ...browse, page }
}


/** Qualify table for multi-database browse. MySQL/MariaDB: `db`.`t`; SQL Server: "db".."t"; PG stays unqualified (session DB). */
export function qualifyBrowseTable(
  dialect: Dialect,
  tableName: string,
  databaseName?: string | null,
): string {
  const style: IdentStyle = identStyle(dialect)
  const table = quoteIdent(tableName, style)
  const db = databaseName?.trim()
  if (!db) return table
  if (dialect === 'postgresql' || dialect === 'sqlite' || dialect === 'redis') return table
  if (dialect === 'sqlserver') {
    return `${quoteIdent(db, style)}..${table}`
  }
  // mysql / mariadb
  return `${quoteIdent(db, style)}.${table}`
}

/** Build SELECT for one page. SQLite includes rowid for cell edits. */
export function buildBrowseSql(
  dialect: Dialect,
  tableName: string,
  page: number,
  pageSize: PageSize,
  databaseName?: string | null,
): string {
  const table = qualifyBrowseTable(dialect, tableName, databaseName)
  const offset = pageOffset(page, pageSize)
  const limit = pageSize

  if (dialect === 'sqlserver') {
    return (
      `SELECT *\nFROM ${table}\n` +
      `ORDER BY (SELECT NULL)\n` +
      `OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY;`
    )
  }

  if (dialect === 'sqlite') {
    return `SELECT rowid AS __rowid__, *\nFROM ${table}\nLIMIT ${limit} OFFSET ${offset};`
  }

  // mysql / mariadb / postgresql / others with LIMIT
  return `SELECT *\nFROM ${table}\nLIMIT ${limit} OFFSET ${offset};`
}

export function buildCountSql(
  dialect: Dialect,
  tableName: string,
  databaseName?: string | null,
): string {
  const table = qualifyBrowseTable(dialect, tableName, databaseName)
  return `SELECT COUNT(*) AS __cnt__\nFROM ${table};`
}

export function parseCountValue(row: Record<string, unknown> | null | undefined): number | null {
  if (!row) return null
  const raw = row.__cnt__ ?? row.cnt ?? row.COUNT ?? row.count ?? Object.values(row)[0]
  const n = typeof raw === 'bigint' ? Number(raw) : Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

export function formatPageInfo(browse: TableBrowseState): string {
  const pages = pageCount(browse.totalRows ?? null, browse.pageSize)
  const pageLabel = browse.page + 1
  if (browse.totalRows == null) {
    return `第 ${pageLabel} 页 · ${browse.pageSize}/页`
  }
  if (pages == null) {
    return `第 ${pageLabel} 页 · 共 ${browse.totalRows} 行`
  }
  return `第 ${pageLabel} / ${pages} 页 · 共 ${browse.totalRows} 行 · ${browse.pageSize}/页`
}

export function canPrevPage(browse: TableBrowseState): boolean {
  return browse.page > 0
}

export function canNextPage(browse: TableBrowseState): boolean {
  const pages = pageCount(browse.totalRows ?? null, browse.pageSize)
  if (pages != null) return browse.page < pages - 1
  // Unknown total: allow next (caller may disable when last page returned < pageSize)
  return true
}
