/** Status-bar word-wrap chip copy (M95). */

export function statusBarWordWrapLabel(on: boolean): string {
  return on ? '换行' : '换行 关'
}

export function statusBarWordWrapTitle(on: boolean): string {
  return on ? '关闭自动换行（Alt+Z）' : '开启自动换行（Alt+Z）'
}
