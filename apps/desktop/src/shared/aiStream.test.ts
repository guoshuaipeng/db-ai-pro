import { describe, expect, it } from 'vitest'
import { settleCancelledTurn } from './aiStream'

describe('settleCancelledTurn', () => {
  it('keeps streamed content', () => {
    const next = settleCancelledTurn({
      id: '1',
      role: 'assistant',
      content: 'SELECT 1',
      mode: 'preview',
      status: 'streaming',
    })
    expect(next.content).toBe('SELECT 1')
    expect(next.status).toBe('cancelled')
  })

  it('fills placeholder when empty', () => {
    expect(settleCancelledTurn({ id: '1', role: 'assistant', content: '' }).content).toBe('（已停止生成）')
  })
})
