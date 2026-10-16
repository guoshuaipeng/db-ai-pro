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