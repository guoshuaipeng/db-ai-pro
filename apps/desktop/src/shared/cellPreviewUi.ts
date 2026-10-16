/** Cell value preview dialog copy & helpers (M155). */

import type { CellPreviewPayload } from './cellValuePreview'

export function cellPreviewKicker(): string {
  return '单元格预览'
}

export function cellPreviewLead(payload: CellPreviewPayload): string {
  const bits = ['只读预览（不写库）']
  if (payload.jsonPretty) bits.push('已格式化为 JSON')
  if (payload.isNull) bits.push('NULL')
  else if (payload.isEmpty) bits.push('空字符串')
  return bits.join(' · ')
}

export function cellPreviewNullTitle(): string {
  return '此单元格为 NULL'
}

export function cellPreviewNullBody(): string {
  return '数据库中的空值。复制将得到文本 NULL，便于粘贴到调试笔记。'
}

export function cellPreviewEmptyTitle(): string {
  return '此单元格是空字符串'
}

export function cellPreviewEmptyBody(): string {
  return '与 NULL 不同：长度为 0 的文本。复制将得到空内容（不含引号）。'
}

export function cellPreviewBinaryTitle(): string {
  return '二进制内容'
}

export function cellPreviewBinaryBody(): string {
  return '当前仅显示占位说明，不在对话框内展开二进制字节。'
}

export function cellPreviewStats(text: string): { chars: number; lines: number; label: string } {
  const chars = text.length
  const lines = text.length === 0 ? 0 : text.split(/\r\n|\n|\r/).length
  return {
    chars,
    lines,
    label: `${chars.toLocaleString('zh-CN')} 字符 · ${lines.toLocaleString('zh-CN')} 行`,
  }
}

export function cellPreviewCopiedToast(): string {
  return '已复制单元格全文'
}

export function cellPreviewCopyLabel(): string {
  return '复制全文'
}

export function cellPreviewWrapOnLabel(): string {
  return '自动换行'
}

export function cellPreviewWrapOffLabel(): string {
  return '不换行'
}

export function cellPreviewFindLabel(): string {
  return '在预览中查找'
}

export function cellPreviewFindCount(hits: number): string {
  if (hits <= 0) return '无匹配'
  return `${hits} 处匹配`
}

export function countPreviewFindHits(text: string, query: string): number {
  const q = query.trim()
  if (!q) return 0
  const hay = text.toLowerCase()
  const needle = q.toLowerCase()
  let count = 0
  let from = 0
  while (from <= hay.length) {
    const at = hay.indexOf(needle, from)
    if (at < 0) break
    count += 1
    from = at + Math.max(1, needle.length)
  }
  return count
}

/** Clipboard text: empty string for empty cells; NULL literal for SQL null. */
export function cellPreviewClipboardText(payload: CellPreviewPayload): string {
  if (payload.isNull) return 'NULL'
  if (payload.isEmpty) return ''
  return payload.text
}
