import { describe, expect, it } from 'vitest'
import {
  filterShortcutHelp,
  formatShortcutHelpClipboard,
  shortcutHelpEmptyBody,
  shortcutKeysCopiedToast,
  shortcutListCopiedToast,
} from './shortcutHelp'

const rows = [
  { action: '运行 SQL', keys: 'Ctrl+Enter · F5' },
  { action: '命令 / 对象搜索', keys: 'Ctrl+K · Ctrl+P' },
  { action: '刷新对象树', keys: '侧栏刷新 · 连接/库/表菜单「刷新」' },
]

describe('filterShortcutHelp', () => {
  it('returns all when query empty', () => {
    expect(filterShortcutHelp(rows, '')).toEqual(rows)
    expect(filterShortcutHelp(rows, '  ')).toEqual(rows)
  })

  it('matches action or keys', () => {
    expect(filterShortcutHelp(rows, 'sql').map((r) => r.action)).toEqual(['运行 SQL'])
    expect(filterShortcutHelp(rows, 'f5').map((r) => r.action)).toEqual(['运行 SQL'])
    expect(filterShortcutHelp(rows, '刷新').map((r) => r.action)).toEqual(['刷新对象树'])
  })

  it('matches compacted key chords', () => {
    expect(filterShortcutHelp(rows, 'ctrlk').map((r) => r.action)).toEqual(['命令 / 对象搜索'])
  })

  it('returns empty when nothing matches', () => {
    expect(filterShortcutHelp(rows, 'zzz')).toEqual([])
  })
})

describe('shortcut clipboard helpers', () => {
  it('formats TSV lines and Chinese toasts', () => {
    expect(formatShortcutHelpClipboard(rows)).toContain('运行 SQL')
    expect(formatShortcutHelpClipboard(rows)).toContain('\t')
    expect(shortcutKeysCopiedToast('运行 SQL')).toContain('运行 SQL')
    expect(shortcutListCopiedToast(3)).toContain('3')
    expect(shortcutHelpEmptyBody()).toContain('匹配')
  })
})

