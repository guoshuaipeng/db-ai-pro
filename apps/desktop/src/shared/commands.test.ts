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

  it('finds reset layout command', () => {
    expect(filterCommands('重置布局').some((item) => item.id === 'view.resetLayout')).toBe(true)
  })

  it('finds minimap command', () => {
    expect(filterCommands('小地图').some((item) => item.id === 'view.toggleMinimap')).toBe(true)
  })

  it('finds cycle editor tab commands', () => {
    expect(filterCommands('下一个').some((item) => item.id === 'view.nextEditorTab')).toBe(true)
    expect(filterCommands('上一个').some((item) => item.id === 'view.prevEditorTab')).toBe(true)
  })

  it('finds focus result command', () => {
    expect(filterCommands('结果').some((item) => item.id === 'view.focusResult')).toBe(true)
    expect(filterCommands('focus result').some((item) => item.id === 'view.focusResult')).toBe(true)
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

  it('finds save/open sql file commands', () => {
    expect(filterCommands('保存 SQL').some((item) => item.id === 'query.saveToFile')).toBe(true)
    expect(filterCommands('打开 SQL').some((item) => item.id === 'query.openFromFile')).toBe(true)
  })

  it('finds reveal connection in tree command', () => {
    expect(filterCommands('对象树').some((item) => item.id === 'connection.revealInTree')).toBe(true)
  })

  it('finds collapse object tree command', () => {
    expect(filterCommands('折叠').some((item) => item.id === 'view.collapseObjectTree')).toBe(true)
  })

  it('finds expand object tree one level command', () => {
    expect(filterCommands('展开').some((item) => item.id === 'view.expandObjectTreeOneLevel')).toBe(true)
  })

  it('finds copy result headers command', () => {
    expect(filterCommands('列名').some((item) => item.id === 'result.copyHeaders')).toBe(true)
  })

  it('finds copy result message command', () => {
    expect(filterCommands('复制输出').some((item) => item.id === 'result.copyMessage')).toBe(true)
  })

  it('finds copy result markdown command', () => {
    expect(filterCommands('Markdown').some((item) => item.id === 'result.copyMarkdown')).toBe(true)
  })

  it('finds copy result json command', () => {
    expect(filterCommands('JSON').some((item) => item.id === 'result.copyJson')).toBe(true)
  })

  it('finds clear result tabs command', () => {
    expect(filterCommands('清空结果').some((item) => item.id === 'result.clearTabs')).toBe(true)
  })

  it('finds close other/right result tab commands', () => {
    expect(filterCommands('关闭其他结果').some((item) => item.id === 'result.closeOtherTabs')).toBe(true)
    expect(filterCommands('关闭右侧结果').some((item) => item.id === 'result.closeTabsToRight')).toBe(true)
  })

  it('finds query templates', () => {
    expect(filterCommands('模板').some((item) => item.id === 'query.templates')).toBe(true)
    expect(filterCommands('COUNT').some((item) => item.id === 'query.tpl.selectCount')).toBe(true)
  })
})
