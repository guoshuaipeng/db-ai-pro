/** Connection dialog probe / test copy (M173). */

export function connectionTestButtonLabel(probing: boolean): string {
  return probing ? '测试中…' : '测试连接'
}

export function connectionTestButtonTitle(): string {
  return '用当前表单参数试连（不会保存）。SQLite 会检查文件是否可打开。'
}

export function connectionTestSuccessTitle(): string {
  return '可以连接'
}

export function connectionTestSuccessBody(dialectLabel: string): string {
  const d = dialectLabel.trim() || '该数据源'
  return `已用当前参数成功连通 ${d}。确认无误后点击「保存」。`
}

export function connectionTestFailTitle(): string {
  return '无法连接'
}

export function connectionTestFailBody(error?: string): string {
  const detail = error?.trim()
  if (detail) return detail
  return '请检查主机、端口、账号密码或文件路径后重试。'
}

export function connectionTestInvalidToast(): string {
  return '请先修正表单后再测试连接'
}

export function connectionTestSuccessToast(dialectLabel: string): string {
  const d = dialectLabel.trim() || '数据源'
  return `测试成功：可以连接 ${d}`
}

export function connectionTestFailToast(error?: string): string {
  const detail = error?.trim()
  return detail ? `测试失败：${detail}` : '测试失败：无法连接'
}

export function connectionTestProbingStatus(): string {
  return '正在测试连接…'
}
