/** Suggest / derive .sql file names for save/open (M86). */

import { sanitizeTabTitle } from './tabTitle'

const UNSAFE = /[<>:"/\\|?*\x00-\x1f]/g

/** Default save dialog name from tab title. */
export function suggestedSqlFileName(tabTitle: string | null | undefined): string {
  let base = (tabTitle ?? '').trim().replace(/^\u2022\s*/, '')
  if (!base || base === '查询' || /^查询\s*\d+$/.test(base)) base = 'query'
  base = base.replace(UNSAFE, '_').replace(/\s+/g, ' ').trim() || 'query'
  if (base.toLowerCase().endsWith('.sql')) return base
  return `${base}.sql`
}

/** Tab title from a filesystem path basename. */
export function tabTitleFromSqlPath(filePath: string): string {
  const name = filePath.replace(/^.*[/\\]/, '')
  const without = name.replace(/\.sql$/i, '')
  return sanitizeTabTitle(without || '查询')
}
