import { describe, expect, it } from 'vitest'
import { focusResultShortcutLabel, pickFocusResultTarget } from './focusResult'

describe('focusResultShortcutLabel', () => {
  it('is Ctrl+Shift+2', () => {
    expect(focusResultShortcutLabel()).toBe('Ctrl+Shift+2')
  })
})

describe('pickFocusResultTarget', () => {
  it('prefers grid over log and pane', () => {
    expect(pickFocusResultTarget({ grid: 'g', messageLog: 'm', pane: 'p' })).toBe('g')
    expect(pickFocusResultTarget({ messageLog: 'm', pane: 'p' })).toBe('m')
    expect(pickFocusResultTarget({ pane: 'p' })).toBe('p')
    expect(pickFocusResultTarget({})).toBeNull()
  })
})
