/** Query-tab session restore feedback (M170). */

export function sessionTabsRestoredToast(tabCount: number, capped: boolean): string {
  const n = Math.max(0, tabCount)
  if (n <= 0) return '未恢复查询标签，已打开空白查询'
  if (capped) {
    return `已恢复 ${n.toLocaleString('zh-CN')} 个查询标签（已达上限，其余未恢复）`
  }
  if (n === 1) return '已恢复 1 个查询标签'
  return `已恢复 ${n.toLocaleString('zh-CN')} 个查询标签`
}

export function sessionTabsFreshToast(): string {
  return '已打开空白查询（未恢复上次标签）'
}

/** True when raw persisted length exceeded the restore cap. */
export function sessionTabsWereCapped(rawCount: number, restoredCount: number, cap: number): boolean {
  return rawCount > restoredCount && restoredCount >= cap
}

export function sessionRestoreSettingTitle(): string {
  return '启动时恢复标签'
}

export function sessionRestoreSettingBody(): string {
  return '打开应用时还原上次的查询标签与活动标签。关闭后每次启动只打开一个空白查询。'
}

export function sessionRestoreSettingOnLabel(): string {
  return '已开启'
}

export function sessionRestoreSettingOffLabel(): string {
  return '已关闭'
}

export function sessionRestoreEnabledToast(): string {
  return '已开启：下次启动将恢复查询标签'
}

export function sessionRestoreDisabledToast(): string {
  return '已关闭：下次启动将打开空白查询'
}
