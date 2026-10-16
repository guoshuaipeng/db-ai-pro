/** Per-connection database visibility whitelist (M72). */

/** System schemas hidden from the default instance tree (MySQL/MariaDB). */
export const MYSQL_HIDDEN_SCHEMAS = new Set([
  'information_schema',
  'mysql',
  'performance_schema',
  'sys',
])

/** Common system DBs hidden by default listing for SQL Server. */
export const MSSQL_SYSTEM_DATABASES = new Set(['master', 'tempdb', 'model', 'msdb'])

/**
 * Resolve which databases to show.
 * - whitelist null/undefined → all
 * - whitelist [] → none
 * - otherwise → intersection preserving `all` order
 */
export function resolveVisibleDatabases(
  all: readonly string[],
  whitelist: readonly string[] | null | undefined,
): string[] {
  if (whitelist == null) return all.slice()
  const allow = new Set(whitelist.map((name) => name.trim()).filter(Boolean))
  return all.filter((name) => allow.has(name))
}

/** If every known DB is checked, persist null (= show all). */
export function whitelistForSave(
  all: readonly string[],
  checked: readonly string[],
): string[] | null {
  const set = new Set(checked.map((name) => name.trim()).filter(Boolean))
  if (all.length > 0 && all.every((name) => set.has(name))) return null
  return all.filter((name) => set.has(name))
}

/** Case-insensitive substring filter; empty query returns all (stable copy). */
export function filterDatabaseNames(all: readonly string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return all.slice()
  return all.filter((name) => name.toLowerCase().includes(q))
}

/**
 * Invert checked state for names in `universe` (typically the filtered list).
 * Names outside `universe` keep their previous checked state.
 */
export function invertDatabaseChecked(
  universe: readonly string[],
  checked: ReadonlySet<string>,
): Set<string> {
  const next = new Set(checked)
  for (const name of universe) {
    if (next.has(name)) next.delete(name)
    else next.add(name)
  }
  return next
}

/** Empty-list copy for the visibility dialog. */
export function dbVisibilityEmptyBody(): string {
  return '没有可显示的库。可能是账号无权列出，或实例上尚无用户库。可重试，或检查连接权限后在对象树中刷新。'
}

