import { describe, expect, it } from 'vitest'
import { composeCreateTable, ddlLabelFor } from './tableStructure'

describe('tableStructure helpers', () => {
  it('labels DDL sources per dialect', () => {
    expect(ddlLabelFor('sqlite')).toBe('sqlite_master')
    expect(ddlLabelFor('mysql')).toBe('SHOW CREATE TABLE')
    expect(ddlLabelFor('postgresql')).toMatch(/CREATE/)
  })

  it('composes CREATE TABLE text', () => {
    const ddl = composeCreateTable(
      'orders',
      [
        { name: 'id', dataType: 'INTEGER', nullable: false, defaultValue: null, primaryKey: true, ordinal: 0 },
        { name: 'total', dataType: 'REAL', nullable: true, defaultValue: '0', primaryKey: false, ordinal: 1 },
      ],
      (name) => `"${name}"`,
    )
    expect(ddl).toContain('CREATE TABLE "orders"')
    expect(ddl).toContain('"id" INTEGER PRIMARY KEY')
    expect(ddl).toContain('DEFAULT 0')
  })
})
