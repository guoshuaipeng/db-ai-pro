/** AI composer focus / placeholder copy (M108). */

import type { AiIntent } from './types'

export function aiComposerPlaceholder(intent: AiIntent): string {
  const sendHint = 'Enter 发送 · Shift+Enter 换行'
  if (intent === 'create') return `描述新表…（${sendHint}）`
  if (intent === 'alter') return `描述改表…（${sendHint}）`
  return `描述想看的数据…（${sendHint}）`
}

export function aiComposerFocusTitle(): string {
  return '聚焦助手输入框'
}
