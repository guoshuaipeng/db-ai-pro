import { describe, expect, it } from 'vitest'
import { supportsManualTransaction, transactionSql } from './transaction'

describe('transaction helpers', () => {
  it('supports main SQL engines', () => {
    expect(supportsManualTransaction('sqlite')).toBe(true)
    expect(supportsManualTransaction('redis')).toBe(false)
  })

  it('returns dialect-aware SQL', () => {
    expect(transactionSql('sqlite', 'begin')).toBe('BEGIN')
    expect(transactionSql('sqlserver', 'commit')).toBe('COMMIT TRANSACTION')
    expect(transactionSql('postgresql', 'rollback')).toBe('ROLLBACK')
  })
})
