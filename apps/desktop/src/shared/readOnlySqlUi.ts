/** Read-only mode SQL block dialog copy (M169). */

export type ReadOnlyBlockSource = 'global' | 'connection' | 'both'

export function readOnlyBlockTitle(verb: string | null): string {
  const v = verb?.trim().toUpperCase()
  if (v) return `只读模式已拦截 ${v}`
  return '只读模式已拦截写操作'
}

export function readOnlyBlockBody(source: ReadOnlyBlockSource): string {
  if (source === 'global') {
    return '当前开启了全局只读。SELECT / EXPLAIN / DESCRIBE / 导出仍可用；写入与 DDL 会被拦截。'
  }
  if (source === 'connection') {
    return '当前连接被标记为只读。SELECT / EXPLAIN / DESCRIBE / 导出仍可用；写入与 DDL 会被拦截。'
  }
  return '全局只读与连接只读同时生效。SELECT / EXPLAIN / DESCRIBE / 导出仍可用；写入与 DDL 会被拦截。'
}

export function readOnlyBlockAllowedTitle(): string {
  return '仍可进行的操作'
}

export function readOnlyBlockAllowedBody(): string {
  return '查询与导出不受影响。若需修改数据，请关闭只读后再执行。'
}

export function readOnlyBlockPreviewLabel(): string {
  return '被拦截的语句'
}

export function readOnlyBlockPreviewAria(): string {
  return '被只读模式拦截的 SQL 预览'
}

export function readOnlyBlockDismissLabel(): string {
  return '知道了'
}

export function readOnlyBlockDisableConnectionLabel(): string {
  return '关闭此连接只读'
}

export function readOnlyBlockDisableGlobalLabel(): string {
  return '关闭全局只读'
}

export function readOnlyBlockCopyLabel(): string {
  return '复制语句'
}

export function readOnlyBlockCopiedToast(): string {
  return '已复制被拦截的语句'
}

export function readOnlyBlockCopyFailToast(): string {
  return '复制失败'
}

export function readOnlyBlockKicker(): string {
  return '安全拦截'
}

export function readOnlyBlockFootnote(): string {
  return 'Esc 关闭 · 只读可随时在状态栏或设置中切换'
}

export function resolveReadOnlyBlockSource(
  globalReadOnly: boolean,
  connectionReadOnly: boolean,
): ReadOnlyBlockSource {
  if (globalReadOnly && connectionReadOnly) return 'both'
  if (globalReadOnly) return 'global'
  return 'connection'
}
