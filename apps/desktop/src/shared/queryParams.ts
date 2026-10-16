/** Session-aware defaults for editor {{name}} params (reuses snippetVars). */

import { defaultSnippetValues, extractSnippetVars, hasSnippetVars } from './snippetVars'

export { expandSnippet, extractSnippetVars, hasSnippetVars } from './snippetVars'

/** Merge session last-values over snippet defaults (hints win only when session empty). */
export function buildQueryParamDefaults(
  sql: string,
  session: Record<string, string>,
  hints?: { table?: string | null; limit?: string | null },
): Record<string, string> {
  const vars = extractSnippetVars(sql)
  const base = defaultSnippetValues(vars, hints)
  for (const name of vars) {
    const remembered = session[name]
    if (remembered != null && remembered !== '') base[name] = remembered
  }
  return base
}

/** Remember non-empty values for later runs in this session. */
export function rememberQueryParamValues(
  session: Record<string, string>,
  values: Record<string, string>,
): Record<string, string> {
  const next = { ...session }
  for (const [name, value] of Object.entries(values)) {
    if (value.trim() !== '') next[name] = value
  }
  return next
}

export function sqlNeedsQueryParams(sql: string): boolean {
  return hasSnippetVars(sql)
}
