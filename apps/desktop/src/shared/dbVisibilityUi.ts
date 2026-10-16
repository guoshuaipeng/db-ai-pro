/** Instance DB checkbox dialog copy (M164). */

export function dbVisibilityDialogCopy(): string {
  return '勾选后会出现在对象树中。全部勾选表示显示实例上所有库（与未设置白名单相同）。'
}

export function dbVisibilitySelectionSummary(checked: number, total: number): string {
  const c = Math.max(0, checked)
  const t = Math.max(0, total)
  if (t <= 0) return '暂无数据库'
  if (c <= 0) return `未勾选任何库（共 ${t.toLocaleString('zh-CN')} 个）`
  if (c >= t) return `已全选 ${t.toLocaleString('zh-CN')} 个库`
  return `已选 ${c.toLocaleString('zh-CN')} / ${t.toLocaleString('zh-CN')}`
}

export function dbVisibilityNoneCheckedWarning(): string {
  return '当前未勾选任何库。保存后对象树将不显示数据库；可先「全选」或「勾选列表」。'
}

export function dbVisibilityCheckListLabel(): string {
  return '勾选列表'
}

export function dbVisibilityCheckListTitle(filterActive: boolean): string {
  return filterActive ? '勾选当前筛选结果中的库（不影响列表外）' : '勾选全部库'
}

export function dbVisibilityOnlyListLabel(): string {
  return '仅保留列表'
}

export function dbVisibilityOnlyListTitle(filterActive: boolean): string {
  return filterActive
    ? '只保留当前筛选结果为勾选，列表外全部取消'
    : '只保留当前列表（与全选相同）'
}

export function dbVisibilityCheckboxAria(name: string, checked: boolean): string {
  const n = name.trim() || '数据库'
  return checked ? `取消显示 ${n}` : `显示 ${n}`
}

export function dbVisibilityListAria(): string {
  return '数据库勾选列表'
}

/** Toast after save; whitelist null = show all. */
export function dbVisibilitySavedToast(whitelist: string[] | null): string {
  if (whitelist == null) return '已显示全部数据库（未设白名单）'
  if (whitelist.length === 0) return '已隐藏全部数据库；对象树中将不显示库'
  return `已更新显示的库（${whitelist.length.toLocaleString('zh-CN')} 个）`
}
