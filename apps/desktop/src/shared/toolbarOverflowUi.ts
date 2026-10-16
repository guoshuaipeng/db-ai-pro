/** Editor toolbar overflow (「更多」) copy (M158). */

export function toolbarMoreLabel(count: number): string {
  if (count > 0) return `更多 · ${count}`
  return '更多'
}

export function toolbarMoreTitle(count: number): string {
  if (count > 0) return `更多编辑操作（${count} 项已收起）`
  return '更多编辑操作'
}

export function toolbarMoreAria(count: number, open: boolean): string {
  const state = open ? '已展开' : '已收起'
  if (count > 0) return `更多编辑操作，${count} 项，${state}`
  return `更多编辑操作，${state}`
}

export function toolbarOverflowMenuKicker(): string {
  return '工具栏'
}

export function toolbarOverflowMenuTitle(): string {
  return '收起的编辑操作'
}

export function toolbarOverflowMenuBody(count: number): string {
  if (count <= 0) return '当前没有需要收起的操作。'
  return `侧栏或窄窗时，${count} 个次要按钮会收进此菜单，主操作（运行等）仍留在右侧。`
}

export function toolbarOverflowEmptyTitle(): string {
  return '没有收起的操作'
}

export function toolbarOverflowEmptyBody(): string {
  return '加宽编辑区或收起侧栏后，按钮会回到工具栏一行显示。'
}
