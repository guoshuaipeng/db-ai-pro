import { describe, expect, it } from 'vitest'
import {
  DATAAI_SQL_DRAG_TYPE,
  decodeSqlDragPayload,
  encodeSqlDragPayload,
  isSqlDragEvent,
  readSqlDragText,
  setSqlDragData,
  type SqlDataTransfer,
} from './sqlDragDrop'

describe('sqlDragDrop', () => {
  it('round-trips payload', () => {
    const raw = encodeSqlDragPayload({ text: 'SELECT 1', source: 'favorite' })
    expect(decodeSqlDragPayload(raw)).toEqual({ text: 'SELECT 1', source: 'favorite' })
    expect(decodeSqlDragPayload('nope')).toBeNull()
  })

  it('detects drag types', () => {
    expect(isSqlDragEvent([DATAAI_SQL_DRAG_TYPE])).toBe(true)
    expect(isSqlDragEvent(['text/plain'])).toBe(true)
    expect(isSqlDragEvent(['Files'])).toBe(false)
  })

  it('writes and reads DataTransfer-like store', () => {
    const store: Record<string, string> = {}
    const dt: SqlDataTransfer = {
      setData: (type: string, value: string) => {
        store[type] = value
      },
      getData: (type: string) => store[type] ?? '',
      effectAllowed: 'none',
    }
    setSqlDragData(dt, '  SELECT * FROM t  ', 'history')
    expect(store['text/plain']).toBe('SELECT * FROM t')
    expect(readSqlDragText(dt)).toBe('SELECT * FROM t')
  })
})
