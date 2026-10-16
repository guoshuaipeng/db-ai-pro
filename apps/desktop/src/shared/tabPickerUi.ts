/** Query-tab overflow picker copy & a11y (M163). */

export function tabPickerButtonTitle(): string {
  return '全部查询标签（筛选并切换）'
}

export function tabPickerButtonAria(): string {
  return '全部标签'
}

export function tabPickerMenuAria(): string {
  return '全部查询标签'
}

export function tabPickerSearchPlaceholder(): string {
  return '筛选标签…'
}

export function tabPickerSearchAria(): string {
  return '筛选标签'
}

export function tabPickerEmptyTitle(): string {
  return '没有匹配的标签'
}

export function tabPickerEmptyBody(): string {
  return '试试标题或角标里的关键字，或清除筛选查看全部打开的查询。'
}

export function tabPickerClearFilterLabel(): string {
  return '清除筛选'
}

export function tabPickerFoot(total: number, shown: number, queryActive: boolean): string {
  const t = Math.max(0, total)
  const s = Math.max(0, shown)
  if (!queryActive) {
    return `${t.toLocaleString('zh-CN')} 个标签 · 中键可关闭`
  }
  return `显示 ${s.toLocaleString('zh-CN')} / ${t.toLocaleString('zh-CN')} · 中键可关闭`
}

/** Screen-reader status when the filter result set changes. */
export function tabPickerFilterStatus(shown: number, total: number, queryActive: boolean): string {
  if (!queryActive) {
    return `共 ${total.toLocaleString('zh-CN')} 个查询标签`
  }
  if (shown <= 0) {
    return '没有匹配的标签'
  }
  return `匹配 ${shown.toLocaleString('zh-CN')} / ${total.toLocaleString('zh-CN')} 个标签`
}

export function tabPickerCloseTitle(): string {
  return '关闭'
}
