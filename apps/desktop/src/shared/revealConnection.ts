/** Status-bar / command copy for reveal-in-tree (M88). */

export function statusBarConnectionTitle(healthTitle: string): string {
  const base = healthTitle.trim() || '当前连接'
  return `${base} · Ctrl+单击在对象树中显示`
}
