/** Object-tree expand persistence feedback (M165). */

export function expandRestoredToast(openCount: number): string {
  const n = Math.max(0, openCount)
  if (n <= 0) return '对象树展开状态已就绪'
  return `已恢复对象树展开（${n.toLocaleString('zh-CN')} 处）`
}

export function expandPersistHint(): string {
  return '展开状态会自动保存，下次打开应用时还原。'
}

export function expandPersistStatus(openCount: number): string {
  const n = Math.max(0, openCount)
  if (n <= 0) return '展开状态：尚未记住深层节点'
  return `已记住 ${n.toLocaleString('zh-CN')} 处展开 · 下次打开还原`
}

export function expandPersistKicker(): string {
  return '展开记忆'
}
