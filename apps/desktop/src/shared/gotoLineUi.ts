/** Go-to-line dialog copy & helpers (M160). */

import type { GotoLineTarget } from './gotoLine'
import { clampGotoLineTarget, formatGotoLineSeed } from './gotoLine'

export function gotoLineKicker(): string {
  return '转到行'
}

export function gotoLineTitle(): string {
  return '转到行'
}

export function gotoLineLead(): string {
  return '输入行号，或「行:列」（如 42 或 42:8）。超出文档时会落到最后一行。'
}

export function gotoLineFieldLabel(): string {
  return '位置'
}

export function gotoLinePlaceholder(): string {
  return '行 或 行:列'
}

export function gotoLineInvalidError(): string {
  return '请输入有效的行号（可选列，须 ≥ 1）。'
}

export function gotoLineEmptyTitle(): string {
  return '当前没有可跳转的文档'
}

export function gotoLineEmptyBody(): string {
  return '先打开或新建一个 SQL 标签页，再使用转到行。'
}

export function gotoLineDocMeta(lineCount: number): string {
  const n = Math.max(0, Math.floor(lineCount) || 0)
  if (n <= 0) return '文档行数未知'
  return `当前文档约 ${n.toLocaleString('zh-CN')} 行`
}

export function gotoLinePreview(
  parsed: GotoLineTarget | null,
  lineCount: number,
): { tone: 'ok' | 'clamp' | 'invalid'; text: string } {
  if (!parsed) return { tone: 'invalid', text: '等待有效输入…' }
  const safeCount = Math.max(1, Math.floor(lineCount) || 1)
  const clamped = clampGotoLineTarget(parsed, safeCount, () => 1_000_000)
  if (clamped.line !== parsed.line) {
    return {
      tone: 'clamp',
      text: `超出文档：将转到第 ${clamped.line} 行，第 ${clamped.column} 列`,
    }
  }
  return {
    tone: 'ok',
    text: `将转到第 ${parsed.line} 行，第 ${parsed.column} 列`,
  }
}

export function gotoLineSubmitLabel(): string {
  return '转到'
}

export function gotoLineChipStart(): string {
  return '行首'
}

export function gotoLineChipCurrent(): string {
  return '当前位置'
}

export function gotoLineChipEnd(): string {
  return '末行'
}

export function gotoLineToast(target: GotoLineTarget): string {
  return `已转到第 ${target.line} 行，第 ${target.column} 列`
}

export function seedGotoLineInput(line: number, column: number): string {
  return formatGotoLineSeed(line, column)
}

/** Approximate editor line count from SQL text (1 when empty). */
export function estimateEditorLineCount(sql: string | null | undefined): number {
  const text = (sql ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  if (text.length === 0) return 1
  return text.split('\n').length
}
