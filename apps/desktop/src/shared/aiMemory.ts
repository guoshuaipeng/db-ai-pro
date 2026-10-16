import type { AiTurnState } from './types'

export const AI_MEMORY_LIMIT = 40

/** Cap conversation length and drop empty assistant shells. */
export function trimAiTurns(turns: AiTurnState[], limit = AI_MEMORY_LIMIT): AiTurnState[] {
  const cleaned = turns.filter((turn) => turn.content.trim().length > 0 || (turn.steps?.length ?? 0) > 0)
  if (cleaned.length <= limit) return cleaned
  return cleaned.slice(cleaned.length - limit)
}
