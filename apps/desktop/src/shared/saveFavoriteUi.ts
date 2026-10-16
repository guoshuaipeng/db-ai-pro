/** Save-favorite dialog copy & preview helpers (M159). */

export function saveFavoriteKicker(): string {
  return '收藏片段'
}

export function saveFavoriteTitle(): string {
  return '收藏当前 SQL'
}

export function saveFavoriteLead(): string {
  return '保存到片段库后，可在收藏面板或命令面板一键插入。名称可改；范围可选全局或仅当前连接。'
}

export function saveFavoriteEmptyTitle(): string {
  return '没有可收藏的 SQL'
}

export function saveFavoriteEmptyBody(): string {
  return '当前标签为空或只有空白。先编写或打开一段 SQL，再打开收藏。'
}

export function saveFavoriteNameLabel(): string {
  return '名称'
}

export function saveFavoriteScopeLegend(): string {
  return '范围'
}

export function saveFavoriteScopeGlobal(): string {
  return '全局片段'
}

export function saveFavoriteScopeConnection(connectionName: string | null | undefined): string {
  if (connectionName) return `仅当前连接（${connectionName}）`
  return '仅当前连接'
}

export function saveFavoritePreviewLabel(): string {
  return 'SQL 预览'
}

export function saveFavoriteCopySqlLabel(): string {
  return '复制 SQL'
}

export function saveFavoriteCopiedToast(): string {
  return '已复制待收藏 SQL'
}

export function saveFavoriteSubmitLabel(busy: boolean): string {
  return busy ? '保存中…' : '收藏'
}

export function saveFavoriteNameHint(name: string, max = 64): string {
  const len = name.trim().length
  if (len <= 0) return `建议填写名称（最多 ${max} 字）`
  return `${len}/${max}`
}

function normalizeSqlNewlines(sql: string): string {
  return sql.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

export function saveFavoriteSqlStats(sql: string): { chars: number; lines: number; label: string } {
  const text = normalizeSqlNewlines(sql).trimEnd()
  const chars = text.length
  const lines = text.length === 0 ? 0 : text.split('\n').length
  return {
    chars,
    lines,
    label: `${chars.toLocaleString('zh-CN')} 字符 · ${lines.toLocaleString('zh-CN')} 行`,
  }
}

/** Compact preview for the dialog (keep head, mark truncation). */
export function saveFavoriteSqlPreview(sql: string, maxLines = 8, maxChars = 600): string {
  const normalized = normalizeSqlNewlines(sql).trim()
  if (!normalized) return ''
  const lines = normalized.split('\n')
  let preview = lines.slice(0, maxLines).join('\n')
  let truncated = lines.length > maxLines
  if (preview.length > maxChars) {
    preview = `${preview.slice(0, maxChars - 1)}…`
    truncated = true
  } else if (truncated) {
    preview = `${preview}\n…`
  }
  return preview
}
