/** Status-bar click-to-rerun helpers (M84). */

export type LastRunKind = 'run' | 'explain'

export function statusBarRerunAction(kind: LastRunKind | null | undefined): 'run' | 'explain' {
  return kind === 'explain' ? 'explain' : 'run'
}

export function statusBarRerunTitle(kind: LastRunKind | null | undefined): string {
  return statusBarRerunAction(kind) === 'explain'
    ? '再次查看执行计划（点击）'
    : '再次运行当前 SQL（点击 · 与 Ctrl+Enter 相同）'
}
