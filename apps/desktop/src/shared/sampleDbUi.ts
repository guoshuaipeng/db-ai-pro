/** Built-in sample business DB restore copy (M175). */

export function sampleDbRestoreSuccessToast(name: string): string {
  const n = name.trim() || '示例业务库'
  return `已恢复「${n}」，可在对象树中展开并运行查询`
}

export function sampleDbRestoreFailToast(error?: string): string {
  const detail = error?.trim()
  return detail ? `恢复示例库失败：${detail}` : '恢复示例库失败'
}

export function sampleDbEmptyActionLabel(): string {
  return '恢复示例库'
}

export function sampleDbEmptyActionTitle(): string {
  return '一键添加内置零售示例 SQLite，立刻可在对象树查询'
}

export function sampleDbEmptyBody(): string {
  return '先添加一个连接。SQLite / MySQL / MariaDB / PostgreSQL / SQL Server 可直接查询；Redis 可浏览键值。也可以一键恢复示例业务库。'
}

export function sampleDbEmptyTitle(): string {
  return '还没有数据库连接'
}

export function sampleDbDialogActionLabel(): string {
  return '改用示例库'
}

export function sampleDbDialogActionTitle(): string {
  return '关闭对话框并恢复内置示例业务库（零售 SQLite）'
}
