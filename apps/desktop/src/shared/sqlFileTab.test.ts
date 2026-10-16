import { describe, expect, it } from 'vitest'
import {
  defaultSqlSaveName,
  sqlFileBannerBody,
  sqlFileBasename,
  sqlFileSavedToast,
  sqlFileTabTitle,
} from './sqlFileTab'

describe('sqlFileTab', () => {
  it('derives basename and titles', () => {
    expect(sqlFileBasename('E:\\work\\orders.sql')).toBe('orders.sql')
    expect(sqlFileTabTitle('E:\\work\\orders.sql')).toBe('orders')
    expect(defaultSqlSaveName('查询 1', 'E:\\a\\b.sql')).toBe('b.sql')
    expect(defaultSqlSaveName('周报', null)).toBe('周报.sql')
    expect(sqlFileSavedToast('E:\\a\\x.sql')).toContain('x.sql')
    expect(sqlFileBannerBody('E:\\a\\x.sql')).toContain('x.sql')
  })
})
