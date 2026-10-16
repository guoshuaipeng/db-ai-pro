import { describe, expect, it } from 'vitest'
import { autoMapColumns, buildInsertBatches, buildSqliteCreateTable, inferSqliteType } from './importPlan'

describe('importPlan', () => {
  it('infers sqlite types', () => {
    expect(inferSqliteType(['1', '2', '3'])).toBe('INTEGER')
    expect(inferSqliteType(['1.5', '2'])).toBe('REAL')
    expect(inferSqliteType(['a', '1'])).toBe('TEXT')
  })

  it('auto-maps columns case-insensitively', () => {
    const mapping = autoMapColumns(['Name', 'age', 'skip'], ['name', 'age'])
    expect(mapping).toEqual([
      { source: 'Name', target: 'name' },
      { source: 'age', target: 'age' },
      { source: 'skip', target: null },
    ])
  })

  it('builds create + insert batches', () => {
    const rows = [
      { name: 'Ada', age: '30' },
      { name: 'Lin', age: '28' },
    ]
    const ddl = buildSqliteCreateTable('people', ['name', 'age'], rows)
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS "people"')
    expect(ddl).toContain('"age" INTEGER')
    const batches = buildInsertBatches({
      tableName: 'people',
      dialect: 'sqlite',
      mapping: [
        { source: 'name', target: 'name' },
        { source: 'age', target: 'age' },
      ],
      rows,
      batchSize: 1,
    })
    expect(batches).toHaveLength(2)
    expect(batches[0]).toContain('INSERT INTO "people"')
    expect(batches[0]).toContain("'Ada'")
  })
})
