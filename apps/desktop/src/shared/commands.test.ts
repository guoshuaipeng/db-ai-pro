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
    expect(hits.some((item) => item.id === 'query.saveFavorite')).toBe(true)
    expect(hits.some((item) => item.id === 'query.favorites')).toBe(true)
  })

  it('finds pin and zoom commands', () => {
    expect(filterCommands('置顶').some((item) => item.id === 'view.alwaysOnTop')).toBe(true)
    expect(filterCommands('zoom').some((item) => item.id === 'view.zoomIn')).toBe(true)
  })

  it('finds minimap command', () => {
    expect(filterCommands('小地图').some((item) => item.id === 'view.toggleMinimap')).toBe(true)
  })

  it('finds toggle comment command', () => {
    expect(filterCommands('注释').some((item) => item.id === 'editor.toggleComment')).toBe(true)
  })

  it('finds goto line command', () => {
    expect(filterCommands('转到行').some((item) => item.id === 'editor.gotoLine')).toBe(true)
    expect(filterCommands('goto').some((item) => item.id === 'editor.gotoLine')).toBe(true)
  })

  it('finds cancel query command', () => {
    expect(filterCommands('取消').some((item) => item.id === 'query.cancel')).toBe(true)
    expect(filterCommands('abort').some((item) => item.id === 'query.cancel')).toBe(true)
  })

  it('finds duplicate connection command', () => {
    expect(filterCommands('复制连接').some((item) => item.id === 'connection.duplicate')).toBe(true)
  })

  it('finds copy connection endpoint command', () => {
    expect(filterCommands('连接地址').some((item) => item.id === 'connection.copyEndpoint')).toBe(true)
  })

  it('finds query templates', () => {
    expect(filterCommands('模板').some((item) => item.id === 'query.templates')).toBe(true)
    expect(filterCommands('COUNT').some((item) => item.id === 'query.tpl.selectCount')).toBe(true)
  })
})
