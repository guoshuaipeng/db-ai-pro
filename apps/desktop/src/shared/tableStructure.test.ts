import { describe, expect, it } from 'vitest'
import {
  composeCreateTable,
  ddlLabelFor,
  filterStructureColumns,
  formatForeignKeyGlance,
  structureTabBadge,
  summarizeStructureDdl,
} from './tableStructure'

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

describe('foreign key glance', () => {
  it('formats local → remote', () => {
    expect(
      formatForeignKeyGlance({
        name: 'fk_orders_customer',
        columns: ['customer_id'],
        refTable: 'customers',
        refColumns: ['id'],
      }),
    ).toBe('customer_id → customers(id)')
  })
})


describe('structure polish helpers', () => {
  const columns = [
    { name: 'id', dataType: 'INTEGER', nullable: false, defaultValue: null, primaryKey: true, ordinal: 0 },
    { name: 'email', dataType: 'TEXT', nullable: true, defaultValue: null, primaryKey: false, ordinal: 1 },
  ]

  it('filters columns and summarizes ddl', () => {
    expect(filterStructureColumns(columns, 'mail')).toHaveLength(1)
    expect(summarizeStructureDdl('CREATE TABLE t (\n  id INT\n);').lineCount).toBe(3)
    expect(summarizeStructureDdl(null).isEmpty).toBe(true)
    expect(
      structureTabBadge('columns', {
        columns,
        indexes: [],
        foreignKeys: [],
        ddl: null,
      }),
    ).toBe('2')
  })
})
