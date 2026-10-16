import { describe, expect, it } from 'vitest'
import { diffTableColumns, suggestAlterSql, summarizeDiff } from './schemaDiff'
import type { TableColumnInfo } from './tableStructure'

const col = (partial: Partial<TableColumnInfo> & { name: string }): TableColumnInfo => ({
  dataType: 'TEXT',
  nullable: true,
  defaultValue: null,
  primaryKey: false,
  ordinal: 0,
  ...partial,
})

describe('diffTableColumns', () => {
  it('detects added removed changed', () => {
    const left = [
      col({ name: 'id', dataType: 'INTEGER', primaryKey: true, nullable: false, ordinal: 0 }),
      col({ name: 'name', dataType: 'TEXT', ordinal: 1 }),
      col({ name: 'age', dataType: 'INTEGER', ordinal: 2 }),
    ]
    const right = [
      col({ name: 'id', dataType: 'INTEGER', primaryKey: true, nullable: false, ordinal: 0 }),
      col({ name: 'name', dataType: 'VARCHAR(50)', ordinal: 1 }),
      col({ name: 'email', dataType: 'TEXT', ordinal: 2 }),
    ]
    const diffs = diffTableColumns(left, right)
    const by = Object.fromEntries(diffs.map((d) => [d.name, d]))
    expect(by.id.kind).toBe('same')
    expect(by.name.kind).toBe('changed')
    expect(by.name.changes).toContain('type')
    expect(by.age.kind).toBe('removed')
    expect(by.email.kind).toBe('added')
    expect(summarizeDiff(diffs)).toMatchObject({ added: 1, removed: 1, changed: 1, same: 1 })
  })
})

describe('suggestAlterSql', () => {
  it('emits ADD for columns only on left', () => {
    const diffs = diffTableColumns(
      [col({ name: 'extra', dataType: 'TEXT' })],
      [],
    )
    const sql = suggestAlterSql({ dialect: 'sqlite', targetTable: 'users', diffs })
    expect(sql).toMatch(/ALTER TABLE "users" ADD "extra" TEXT/i)
  })
})
