import { describe, expect, it } from 'vitest'
import { generateSampleFill } from './sampleData'
import type { TableColumnInfo } from './tableStructure'

const columns: TableColumnInfo[] = [
  { name: 'id', dataType: 'INTEGER', nullable: false, defaultValue: null, primaryKey: true, ordinal: 0 },
  { name: 'name', dataType: 'TEXT', nullable: false, defaultValue: null, primaryKey: false, ordinal: 1 },
  { name: 'amount', dataType: 'REAL', nullable: true, defaultValue: null, primaryKey: false, ordinal: 2 },
  { name: 'email', dataType: 'VARCHAR(80)', nullable: true, defaultValue: null, primaryKey: false, ordinal: 3 },
]

describe('generateSampleFill', () => {
  it('builds INSERT statements and skips sqlite integer PK', () => {
    const plan = generateSampleFill({ tableName: 'orders', dialect: 'sqlite', columns, count: 3, seed: 1 })
    expect(plan.count).toBe(3)
    expect(plan.columns).not.toContain('id')
    expect(plan.sql).toMatch(/^INSERT INTO "orders"/m)
    expect(plan.sql.split('\n')).toHaveLength(3)
    expect(plan.rows[0]?.email === null || String(plan.rows[0]?.email).includes('@')).toBe(true)
  })

  it('clamps count and keeps mysql quoting', () => {
    const plan = generateSampleFill({
      tableName: 't',
      dialect: 'mysql',
      columns: [
        { name: 'id', dataType: 'INT AUTO_INCREMENT', nullable: false, defaultValue: null, primaryKey: true, ordinal: 0 },
        { name: 'title', dataType: 'varchar(40)', nullable: false, defaultValue: null, primaryKey: false, ordinal: 1 },
      ],
      count: 999,
      seed: 2,
    })
    expect(plan.count).toBe(200)
    expect(plan.sql).toContain('INSERT INTO `t`')
    expect(plan.columns).toEqual(['title'])
  })
})
