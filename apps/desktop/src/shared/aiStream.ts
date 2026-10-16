import type { AiTurnState } from './types'

/** Mark an assistant turn as user-cancelled without wiping streamed text. */
export function settleCancelledTurn(turn: AiTurnState): AiTurnState {
  const content = turn.content.trim()
    ? turn.content
    : '（已停止生成）'
  return {
    ...turn,
    content,
    status: 'cancelled',
  }
}
