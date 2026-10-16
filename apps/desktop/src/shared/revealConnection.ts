/** Reveal-in-tree copy for status bar (M88) and title crumb (M92). */

export function statusBarConnectionTitle(healthTitle: string): string {
  const base = healthTitle.trim() || '当前连接'
  return `${base} · Ctrl+单击在对象树中显示`
}

/** Title-bar breadcrumb click affordance. */
export function crumbRevealTitle(hasConnection: boolean): string {
  return hasConnection ? '在对象树中显示当前连接' : '未选择连接'
}
