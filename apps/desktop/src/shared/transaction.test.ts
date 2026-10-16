import { describe, expect, it } from 'vitest'
import {
  supportsManualTransaction,
  transactionSql,
  txnElapsedLabel,
  txnRollbackConfirmMessage,
  txnStatusLabel,
  txnUiState,
} from './transaction'

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

  it('formats txn UI state', () => {
    expect(txnUiState(false, false)).toBe('unsupported')
    expect(txnUiState(true, false)).toBe('idle')
    expect(txnUiState(true, true)).toBe('open')
    expect(txnStatusLabel(true)).toBe('事务中')
    expect(txnElapsedLabel(1500)).toContain('事务中')
    expect(txnElapsedLabel(1500)).toContain('s')
    expect(txnRollbackConfirmMessage()).toContain('回滚')
  })
})
