/** Duplicate-connection feedback copy (M172). */

export function duplicateConnectionMenuLabel(): string {
  return '复制连接'
}

export function duplicateConnectionMenuTitle(): string {
  return '复制为新连接并打开编辑（密码需重新填写）'
}

export function duplicateConnectionSuccessToast(name: string): string {
  const n = name.trim() || '新连接'
  return `已复制为「${n}」，可改名后保存`
}

export function duplicateConnectionFailToast(error?: string): string {
  const detail = error?.trim()
  return detail || '复制连接失败'
}

export function duplicateConnectionDialogHint(): string {
  return '这是副本。名称已自动加「副本」后缀；如需密码请重新填写后再保存。'
}
