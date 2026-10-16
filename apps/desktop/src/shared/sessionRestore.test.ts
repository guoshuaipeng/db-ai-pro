import { describe, expect, it } from 'vitest'
import {
  isTabDisconnected,
  normalizeSessionTabs,
  pickActiveEditorId,
  SESSION_TAB_CAP,
} from './sessionRestore'

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
