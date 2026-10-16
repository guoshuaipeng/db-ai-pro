/** Helpers for AI assistant message card actions (M68). */

import { extractSql, parseBlocks } from './sql'

/** Closed SQL blocks in assistant markdown, in order. */
export function listClosedSqlBlocks(content: string): string[] {
  return parseBlocks(content)
    .filter((block) => block.type === 'sql' && block.closed)
    .map((block) => (block.type === 'sql' ? block.text : ''))
    .filter(Boolean)
}

/** Join closed SQL blocks for clipboard (blank line between). */
export function joinSqlBlocksForCopy(content: string): string | null {
  const blocks = listClosedSqlBlocks(content)
  if (blocks.length === 0) {
    const last = extractSql(content)
    return last ? last : null
  }
  return blocks.join('\n\n')
}

/** Collapse long step lists once generation finished (keep open while streaming). */
export function shouldCollapseAiSteps(stepCount: number, streaming: boolean): boolean {
  if (streaming) return false
  return stepCount >= 4
}

export function aiStepsSummary(stepCount: number): string {
  return `${stepCount} 个步骤`
}

/** Card-level「写入编辑器」title for joined SQL blocks. */
export function aiApplyAllSqlButtonTitle(blockCount: number): string {
  const n = Math.max(0, blockCount)
  if (n <= 1) return '将 SQL 写入编辑器'
  return `将 ${n} 段 SQL 写入编辑器`
}

export function aiApplyAllSqlButtonLabel(blockCount: number): string {
  const n = Math.max(0, blockCount)
  if (n <= 1) return '写入编辑器'
  return `写入编辑器 (${n})`
}

/** After putting a user turn back into the composer. */
export function aiReuseUserPromptToast(): string {
  return '已填入输入框，可编辑后再次发送'
}

export function aiReuseUserPromptTitle(): string {
  return '填入下方输入框以便修改后重发'
}

