import { describe, expect, it } from 'vitest'
import { trimAiTurns } from './aiMemory'

describe('trimAiTurns', () => {
  it('keeps the newest turns within the limit', () => {
    const turns = Array.from({ length: 10 }, (_, index) => ({
      id: String(index),
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `msg ${index}`,
    }))
    const trimmed = trimAiTurns(turns, 4)
    expect(trimmed).toHaveLength(4)
    expect(trimmed[0].content).toBe('msg 6')
  })

  it('drops empty turns', () => {
    expect(trimAiTurns([{ id: '1', role: 'assistant', content: '   ' }])).toEqual([])
  })
})
