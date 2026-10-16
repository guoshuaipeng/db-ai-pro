/** Status-bar read-only / writable chip (M97). */

export function statusBarReadOnlyLabel(readOnlyActive: boolean): string {
  return readOnlyActive ? '只读' : '可写'
}

/** Hover copy: explain effective source + that click toggles global read-only. */
export function statusBarReadOnlyTitle(input: {
  readOnlyActive: boolean
  globalReadOnly: boolean
  connectionReadOnly: boolean
}): string {
  const { readOnlyActive, globalReadOnly, connectionReadOnly } = input
  if (globalReadOnly && connectionReadOnly) {
    return '全局只读 + 连接只读 · 单击关闭全局只读'
  }
  if (globalReadOnly) {
    return '全局只读已开启 · 单击关闭'
  }
  if (connectionReadOnly) {
    return '当前连接为只读 · 单击可开启全局只读（连接只读需在连接设置中关闭）'
  }
  if (readOnlyActive) {
    return '只读模式 · 单击切换全局只读'
  }
  return '可写 · 单击开启全局只读（拦截写入 / DDL）'
}
