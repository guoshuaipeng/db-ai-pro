import { describe, expect, it } from 'vitest'
import {
  clearResultTabsToast,
  closeOtherResultTabsState,
  closeOtherResultTabsToast,
  closeResultTabState,
  closeResultTabToast,
  closeResultTabsToRightState,
  closeResultTabsToRightToast,
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

describe('closeOtherResultTabsState', () => {
  it('keeps only the target tab', () => {
    const state = { tabs: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], activeId: 'a' }
    expect(closeOtherResultTabsState(state, 'b')).toEqual({ tabs: [{ id: 'b' }], activeId: 'b' })
    expect(closeOtherResultTabsState(state, 'a')?.tabs).toHaveLength(1)
  })
})

describe('closeResultTabsToRightState', () => {
  it('drops tabs after fromId', () => {
    const state = { tabs: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], activeId: 'c' }
    expect(closeResultTabsToRightState(state, 'a')).toEqual({ tabs: [{ id: 'a' }], activeId: 'a' })
    expect(closeResultTabsToRightState(state, 'b').tabs.map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('batch toasts', () => {
  it('reports counts', () => {
    expect(closeOtherResultTabsToast(0)).toContain('没有')
    expect(closeOtherResultTabsToast(2)).toContain('2')
    expect(closeResultTabsToRightToast(0)).toContain('右侧')
    expect(closeResultTabsToRightToast(1)).toContain('1')
  })
})

