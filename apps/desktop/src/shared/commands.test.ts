import { describe, expect, it } from 'vitest'
import { COMMAND_CATALOG, filterCommands, fuzzyScore } from './commands'

describe('fuzzyScore', () => {
  it('ranks substring matches above subsequences', () => {
    const sub = fuzzyScore('run', '运行当前 SQL', 'run execute')
    const far = fuzzyScore('run', '清空助手会话', 'clear')
    expect(sub).not.toBeNull()
    expect(far).toBeNull()
  })
})

describe('filterCommands', () => {
  it('finds explain by keyword', () => {
    const hits = filterCommands('explain')
    expect(hits.some((item) => item.id === 'query.explain')).toBe(true)
  })

  it('returns full catalog for empty query', () => {
    expect(filterCommands('').length).toBe(COMMAND_CATALOG.length)
  })

  it('matches chinese title fragments', () => {
    const hits = filterCommands('收藏')
    expect(hits[0]?.id).toBe('query.favorites')
  })

  it('finds pin and zoom commands', () => {
    expect(filterCommands('置顶').some((item) => item.id === 'view.alwaysOnTop')).toBe(true)
    expect(filterCommands('zoom').some((item) => item.id === 'view.zoomIn')).toBe(true)
  })

  it('finds minimap command', () => {
    expect(filterCommands('小地图').some((item) => item.id === 'view.toggleMinimap')).toBe(true)
  })
})
