import { describe, expect, it } from 'vitest'
import { isTabstripBackgroundDoubleClick, type TabstripClickTarget } from './tabstripNewTab'

describe('isTabstripBackgroundDoubleClick', () => {
  it('allows empty spacer', () => {
    const spacer: TabstripClickTarget = {
      closest: (selector) => {
        if (selector.includes('.tabstrip-empty')) return spacer
        if (selector.startsWith('.tab,')) return null
        return null
      },
    }
    expect(isTabstripBackgroundDoubleClick(spacer)).toBe(true)
  })

  it('blocks tab controls', () => {
    const tabMain: TabstripClickTarget = {
      closest: (selector) => {
        if (selector.startsWith('.tab,')) return tabMain
        return null
      },
    }
    expect(isTabstripBackgroundDoubleClick(tabMain)).toBe(false)
  })

  it('rejects null', () => {
    expect(isTabstripBackgroundDoubleClick(null)).toBe(false)
  })
})
