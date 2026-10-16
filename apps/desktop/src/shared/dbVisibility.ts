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