/** Destructive SQL confirm dialog copy (M166). */

export function destructiveDialogTitle(reasonCount: number): string {
  const n = Math.max(0, reasonCount)
  if (n <= 0) return '确认执行高风险 SQL'
  return `确认执行高风险 SQL（${n.toLocaleString('zh-CN')} 类）`
}

export function destructiveDialogBody(): string {
  return '检测到可能造成数据丢失的语句。请核对下方风险与预览，确认无误后再执行。'
}

export function destructiveReasonsEmptyTitle(): string {
  return '未列出具体风险项'
}

export function destructiveReasonsEmptyBody(): string {
  return '仍建议先检查 SQL，或取消后在编辑器中复核再执行。'
}

export function destructivePreviewLabel(): string {
  return '将执行的 SQL 预览'
}

export function destructivePreviewAria(): string {
  return '高风险 SQL 预览'
}

export function destructiveCancelLabel(): string {
  return '取消'
}

export function destructiveSkipSessionLabel(): string {
  return '本次会话不再询问并执行'
}

export function destructiveSkipSessionTitle(): string {
  return '本应用会话内跳过后续高风险确认，立即执行当前语句'
}

export function destructiveRunLabel(): string {
  return '确认执行'
}

export function destructiveRunTitle(): string {
  return '确认执行高风险语句（不可自动撤销）'
}

export function destructiveCopyPreviewLabel(): string {
  return '复制预览'
}

export function destructiveCopyPreviewToast(): string {
  return '已复制 SQL 预览'
}

export function destructiveCopyPreviewFailToast(): string {
  return '复制失败'
}

export function destructiveFootnote(): string {
  return 'Esc 取消 · 建议先在只读副本或事务中验证'
}

export function destructiveReasonsAria(): string {
  return '检测到的风险类型'
}
