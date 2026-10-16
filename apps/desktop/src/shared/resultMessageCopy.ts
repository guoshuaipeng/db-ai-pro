/** Copy result message / EXPLAIN plan text to clipboard (M94). */

export function resultMessageCopyText(message: string | null | undefined): string {
  return (message ?? '').replace(/\r\n/g, '\n')
}

export function resultMessageCopiedToast(kind: 'plan' | 'message' | 'empty'): string {
  if (kind === 'empty') return '没有可复制的输出'
  if (kind === 'plan') return '已复制执行计划'
  return '已复制输出'
}

export function resultMessageCopyKind(
  kind: string | null | undefined,
  message: string | null | undefined,
): 'plan' | 'message' | 'empty' {
  const text = resultMessageCopyText(message)
  if (!text.trim()) return 'empty'
  return kind === 'plan' ? 'plan' : 'message'
}
