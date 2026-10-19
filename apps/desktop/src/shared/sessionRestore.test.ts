import { describe, expect, it } from 'vitest'
import {
  healSeedSampleTabs,
  isSeedSampleTab,
  isTabDisconnected,
  normalizeSessionTabs,
  pickActiveEditorId,
  SESSION_TAB_CAP,
} from './sessionRestore'
import { INITIAL_TABS, SAMPLE_CONNECTION_ID, SQL } from './session'

describe('sessionRestore', () => {
  it('normalizes and caps tabs without secrets', () => {
    const many = Array.from({ length: SESSION_TAB_CAP + 3 }, (_, i) => ({
      id: `t${i}`,
      title: `Q${i}`,
      sql: 'SELECT 1',
      connectionId: 'c1',
      password: 'nope',
    }))
    const tabs = normalizeSessionTabs(many)
    expect(tabs).toHaveLength(SESSION_TAB_CAP)
    expect(tabs[0]).toEqual({
      id: 't0',
      title: 'Q0',
      sql: 'SELECT 1',
      connectionId: 'c1',
    })
    expect('password' in tabs[0]).toBe(false)
  })

  it('marks missing connection as disconnected', () => {
    expect(isTabDisconnected({ id: '1', title: 'a', sql: 'x', connectionId: 'gone' }, ['c1'])).toBe(
      true,
    )
    expect(isTabDisconnected({ id: '1', title: 'a', sql: 'x', connectionId: 'c1' }, ['c1'])).toBe(
      false,
    )
    expect(isTabDisconnected({ id: '1', title: 'a', sql: 'x', connectionId: null }, ['c1'])).toBe(
      false,
    )
  })

  it('picks active id', () => {
    const tabs = [
      { id: 'a', title: 'A', sql: '' },
      { id: 'b', title: 'B', sql: '' },
    ]
    expect(pickActiveEditorId(tabs, 'b')).toBe('b')
    expect(pickActiveEditorId(tabs, 'missing')).toBe('a')
  })

  it('sanitizes empty title on restore', () => {
    const tabs = normalizeSessionTabs([{ id: 'x', title: '   ', sql: '1' }])
    expect(tabs[0].title).toBe('查询')
  })

  it('persists pinned and sorts left; strips baselineSql', () => {
    const tabs = normalizeSessionTabs([
      { id: 'a', title: 'A', sql: '1', baselineSql: '1' },
      { id: 'b', title: 'B', sql: '2', pinned: true, baselineSql: 'nope' },
      { id: 'c', title: 'C', sql: '3', pinned: false },
    ])
    expect(tabs.map((tab) => tab.id)).toEqual(['b', 'a', 'c'])
    expect(tabs[0].pinned).toBe(true)
    expect(tabs[1].pinned).toBeUndefined()
    expect(tabs.every((tab) => !('baselineSql' in tab))).toBe(true)
  })

  it('keeps browse paging meta without secrets', () => {
    const tabs = normalizeSessionTabs([
      {
        id: 't1',
        title: 'orders',
        sql: 'SELECT 1',
        connectionId: 'c1',
        browse: { connectionId: 'c1', tableName: 'orders', page: 2, pageSize: 500, totalRows: 1200 },
        password: 'x',
      },
    ])
    expect(tabs[0].browse).toEqual({
      connectionId: 'c1',
      tableName: 'orders',
      page: 2,
      pageSize: 500,
      totalRows: 1200,
    })
    expect('password' in tabs[0]).toBe(false)
  })

})

describe('healSeedSampleTabs', () => {
  it('detects seed sample tabs by title+sql', () => {
    expect(isSeedSampleTab({ title: '客户总览', sql: SQL.customers })).toBe(true)
    expect(isSeedSampleTab({ title: '客户总览', sql: 'SELECT 1' })).toBe(false)
  })

  it('rebinds seed demos to sample-retail and clears databaseName', () => {
    const tabs = healSeedSampleTabs([
      {
        id: 'query-1',
        title: '客户总览',
        sql: SQL.customers,
        connectionId: 'wrong-mysql',
        databaseName: 'snowy-cloud',
      },
      {
        id: 'custom',
        title: 'mine',
        sql: 'SELECT 1',
        connectionId: 'c1',
        databaseName: 'db1',
      },
    ])
    expect(tabs[0].connectionId).toBe(SAMPLE_CONNECTION_ID)
    expect(tabs[0].databaseName).toBeUndefined()
    expect(tabs[1].connectionId).toBe('c1')
    expect(tabs[1].databaseName).toBe('db1')
  })

  it('INITIAL_TABS all bind to sample', () => {
    expect(INITIAL_TABS.every((t) => t.connectionId === SAMPLE_CONNECTION_ID)).toBe(true)
  })
})

describe('databaseName persist', () => {
  it('keeps databaseName on normalize', () => {
    const tabs = normalizeSessionTabs([
      { id: 't1', title: 'Q', sql: 'SELECT 1', connectionId: 'c1', databaseName: 'retail' },
    ])
    expect(tabs[0].databaseName).toBe('retail')
  })
})
