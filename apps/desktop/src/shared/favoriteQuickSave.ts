/** Defaults for one-click / command-palette favorite save (M79). */

const TITLE_MAX = 64

/** Prefer tab title; else first non-empty SQL line; else 未命名片段. */
export function defaultFavoriteName(tabTitle: string | null | undefined, sql: string): string {
  const fromTab = (tabTitle ?? '').trim().replace(/^\u2022\s*/, '') // strip dirty bullet if present
  if (fromTab && fromTab !== '查询' && !/^查询\s*\d+$/.test(fromTab)) {
    return fromTab.slice(0, TITLE_MAX)
  }
  const line = sql
    .split(/\r?\n/)
    .map((row) => row.trim())
    .find((row) => row.length > 0 && !row.startsWith('--'))
  if (line) {
    const clipped = line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line
    return clipped
  }
  return '未命名片段'
}

export function canSaveFavoriteSql(sql: string | null | undefined): boolean {
  return Boolean(sql?.trim())
}

