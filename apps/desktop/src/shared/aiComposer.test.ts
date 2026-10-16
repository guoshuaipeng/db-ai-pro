import { describe, expect, it } from 'vitest'
import { aiComposerFocusTitle, aiComposerPlaceholder } from './aiComposer'

describe('aiComposerPlaceholder', () => {
  it('mentions Enter send and Shift+Enter newline', () => {
    for (const intent of ['query', 'create', 'alter'] as const) {
      const p = aiComposerPlaceholder(intent)
      expect(p).toContain('Enter 发送')
      expect(p).toContain('Shift+Enter')
    }
  })
})

describe('aiComposerFocusTitle', () => {
  it('is chinese', () => {
    expect(aiComposerFocusTitle()).toContain('助手')
  })
})
