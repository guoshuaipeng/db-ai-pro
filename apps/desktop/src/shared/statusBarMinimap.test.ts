import { describe, expect, it } from 'vitest'
import { statusBarMinimapLabel, statusBarMinimapTitle } from './statusBarMinimap'

describe('statusBarMinimap', () => {
  it('labels on/off', () => {
    expect(statusBarMinimapLabel(true)).toBe('小地图')
    expect(statusBarMinimapLabel(false)).toContain('关')
  })

  it('titles explain click', () => {
    expect(statusBarMinimapTitle(true)).toContain('关闭')
    expect(statusBarMinimapTitle(false)).toContain('开启')
  })
})
