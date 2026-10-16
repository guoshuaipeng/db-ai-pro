import type { Dialect } from './types'

export type TxnAction = 'begin' | 'commit' | 'rollback'

/** SQL fallbacks when a driver uses generic statements. */
export function transactionSql(dialect: Dialect, action: TxnAction): string {
  if (dialect === 'sqlserver') {
    if (action === 'begin') return 'BEGIN TRANSACTION'
    if (action === 'commit') return 'COMMIT TRANSACTION'
    return 'ROLLBACK TRANSACTION'
  }
  if (action === 'begin') return 'BEGIN'
  if (action === 'commit') return 'COMMIT'
  return 'ROLLBACK'
}

export function supportsManualTransaction(dialect: Dialect): boolean {
  return dialect === 'sqlite' || dialect === 'mysql' || dialect === 'mariadb' || dialect === 'postgresql' || dialect === 'sqlserver'
}
