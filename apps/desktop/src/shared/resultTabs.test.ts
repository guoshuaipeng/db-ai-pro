import { describe, expect, it } from 'vitest'
import {
  clearResultTabsToast,
  closeResultTabState,
  closeResultTabToast,
} from './resultTabs'

describe('closeResultTabState', () => {
  const state = {
    tabs: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    activeId: 'b',
  }

  it('removes a non-active tab', () => {
    expect(closeResultTabState(state, 'a')).toEqual({
      tabs: [{ id: 'b' }, { id: 'c' }],
      activeId: 'b',
    })
  })

  it('activates neighbor when closing active', () => {
    expect(closeResultTabState(state, 'b')?.activeId).toBe('c')
    expect(closeResultTabState({ tabs: [{ id: 'a' }, { id: 'b' }], activeId: 'b' }, 'b')?.activeId).toBe('a')
  })

  it('returns null when last tab closes', () => {
    expect(closeResultTabState({ tabs: [{ id: 'a' }], activeId: 'a' }, 'a')).toBeNull()
  })
})

describe('toasts', () => {
  it('formats clear / close copy', () => {
    expect(clearResultTabsToast(0)).toContain('没有')
    expect(clearResultTabsToast(3)).toContain('3')
    expect(closeResultTabToast()).toContain('关闭')
  })
})
