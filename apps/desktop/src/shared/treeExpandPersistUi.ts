/** Object-tree expand + selection persistence feedback (M165+). */

export function expandRestoredToast(openCount: number): string {
  const n = Math.max(0, openCount)
  if (n <= 0) return '对象树展开状态已就绪'
  return `已恢复对象树展开（${n.toLocaleString('zh-CN')} 处）`
}

export function expandPersistHint(): string {
  return '展开与选中节点会自动保存，下次打开应用时还原并滚到选中项。'
}

export function expandPersistStatus(openCount: number): string {
  const n = Math.max(0, openCount)
  if (n <= 0) return '展开状态：尚未记住深层节点（将还原上次连接的库列表）'
  return `已记住 ${n.toLocaleString('zh-CN')} 处展开 · 下次打开还原选中`
}

export function expandPersistKicker(): string {
  return '展开记忆'
}

export function selectionRestoredToast(): string {
  return '已定位到上次选中的对象'
}
