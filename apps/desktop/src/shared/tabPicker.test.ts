import { describe, expect, it } from 'vitest'
import { filterTabsForPicker } from './tabPicker'

const tabs = [
  { id: '1', label: '订单查询', pinned: true },
  { id: '2', label: '用户表 · users', badge: '离线' },
  { id: '3', label: '• 草稿 SQL' },
  { id: '4', label: 'retail.db / orders' },
]

describe('filterTabsForPicker', () => {
  it('returns all tabs when query is empty or whitespace', () => {
    expect(filterTabsForPicker(tabs, '')).toEqual(tabs)
    expect(filterTabsForPicker(tabs, '  ')).toEqual(tabs)
  })

  it('matches label substring case-insensitively', () => {
    expect(filterTabsForPicker(tabs, 'sql').map((t) => t.id)).toEqual(['3'])
    expect(filterTabsForPicker(tabs, 'USERS').map((t) => t.id)).toEqual(['2'])
  })

  it('matches badge text', () => {
    expect(filterTabsForPicker(tabs, '离线').map((t) => t.id)).toEqual(['2'])
  })

  it('returns empty when nothing matches', () => {
    expect(filterTabsForPicker(tabs, 'zzz')).toEqual([])
  })
})
