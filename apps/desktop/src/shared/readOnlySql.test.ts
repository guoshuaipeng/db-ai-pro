import { describe, expect, it } from 'vitest'
import {
  analyzeReadOnlySql,
  isMutatingStatement,
  isReadOnlyEffective,
  peelWithClauses,
} from './readOnlySql'

describe('readOnlySql', () => {
  it('allows select / explain and peels WITH', () => {
    expect(isMutatingStatement('SELECT 1')).toBe(false)
    expect(isMutatingStatement('EXPLAIN SELECT 1')).toBe(false)
    expect(peelWithClauses('WITH a AS (SELECT 1) SELECT * FROM a').toLowerCase().startsWith('select')).toBe(
      true,
    )
    expect(isMutatingStatement('WITH a AS (SELECT 1) SELECT * FROM a')).toBe(false)
  })

  it('blocks write and ddl', () => {
    expect(isMutatingStatement('INSERT INTO t VALUES (1)')).toBe(true)
    expect(isMutatingStatement('UPDATE t SET x=1')).toBe(true)
    expect(isMutatingStatement('DELETE FROM t')).toBe(true)
    expect(isMutatingStatement('DROP TABLE t')).toBe(true)
    expect(isMutatingStatement('CREATE TABLE t (id INT)')).toBe(true)
    expect(isMutatingStatement('WITH a AS (SELECT 1) INSERT INTO t SELECT * FROM a')).toBe(true)
  })

  it('analyzes scripts and effective flag', () => {
    expect(analyzeReadOnlySql('SELECT 1; INSERT INTO t VALUES (1)').blocked).toBe(true)
    expect(analyzeReadOnlySql('SELECT 1').blocked).toBe(false)
    expect(isReadOnlyEffective(true, false)).toBe(true)
    expect(isReadOnlyEffective(false, true)).toBe(true)
    expect(isReadOnlyEffective(false, false)).toBe(false)
  })
})
