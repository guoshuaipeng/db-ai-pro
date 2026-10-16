import { describe, expect, it } from 'vitest'
import {
  SETTINGS_SEARCH_ITEMS,
  filterSettingsItems,
  settingsSearchEmptyBody,
  settingsSearchMatchCountLabel,
  tabHasSettingsMatch,
  visibleSettingIdsForTab,
} from './settingsSearch'

describe('settingsSearch', () => {
  it('returns all items for empty query', () => {
    expect(filterSettingsItems(SETTINGS_SEARCH_ITEMS, '')).toHaveLength(SETTINGS_SEARCH_ITEMS.length)
    expect(filterSettingsItems(SETTINGS_SEARCH_ITEMS, '   ')).toHaveLength(SETTINGS_SEARCH_ITEMS.length)
  })

  it('matches Chinese title and keywords', () => {
    const zoom = filterSettingsItems(SETTINGS_SEARCH_ITEMS, '缩放')
    expect(zoom.some((item) => item.id === 'zoom')).toBe(true)
    const timeout = filterSettingsItems(SETTINGS_SEARCH_ITEMS, '超时')
    expect(timeout.map((item) => item.id)).toEqual(['queryTimeoutSec'])
  })

  it('scopes visible ids to a tab', () => {
    const ids = visibleSettingIdsForTab('appearance', '通知')
    expect(ids.has('notifyOnErrorOnly')).toBe(true)
    expect(ids.has('notifyOnSlowQuery')).toBe(true)
    expect(ids.has('zoom')).toBe(false)
  })

  it('reports tab match for nav hints', () => {
    expect(tabHasSettingsMatch('query', '慢查询')).toBe(true)
    expect(tabHasSettingsMatch('model', '慢查询')).toBe(false)
    expect(tabHasSettingsMatch('about', '')).toBe(true)
  })

  it('empty body and count label', () => {
    expect(settingsSearchEmptyBody()).toContain('没有匹配')
    expect(settingsSearchMatchCountLabel(2, 10)).toBe('2/10')
  })
})
