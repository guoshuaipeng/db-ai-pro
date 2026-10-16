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


export type TxnUiState = 'unsupported' | 'idle' | 'open'

export function txnUiState(supported: boolean, open: boolean): TxnUiState {
  if (!supported) return 'unsupported'
  return open ? 'open' : 'idle'
}

export function txnStatusLabel(open: boolean): string {
  return open ? '事务中' : '未开事务'
}

export function txnStatusTitle(open: boolean): string {
  if (open) {
    return '当前连接处于手动事务中：更改需提交后才会永久写入；可点工具栏「提交」或「回滚」。'
  }
  return '当前为自动提交。需要多步一起生效时，先点「开始事务」。'
}

export function txnOpenBannerTitle(): string {
  return '手动事务进行中'
}

export function txnOpenBannerBody(): string {
  return '此连接的写入在提交前不会永久落盘。确认无误后提交；若要丢弃更改请回滚。'
}

export function txnIdleHint(): string {
  return '开始事务后可连续执行多条 SQL，最后统一提交或回滚。'
}

export function txnBeginButtonLabel(): string {
  return '开始事务'
}

export function txnCommitButtonLabel(): string {
  return '提交'
}

export function txnRollbackButtonLabel(): string {
  return '回滚'
}

export function txnBeginButtonTitle(): string {
  return 'BEGIN · 开始手动事务（关闭自动提交）'
}

export function txnCommitButtonTitle(): string {
  return 'COMMIT · 提交当前事务中的全部更改'
}

export function txnRollbackButtonTitle(): string {
  return 'ROLLBACK · 回滚并丢弃未提交更改'
}

export function txnRollbackConfirmMessage(): string {
  return '回滚将丢弃当前事务中未提交的更改，确定继续？'
}

export function txnElapsedLabel(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return '事务中'
  const sec = elapsedMs / 1000
  if (sec < 60) return `事务中 · ${sec < 10 ? sec.toFixed(1) : Math.round(sec)} s`
  const min = Math.floor(sec / 60)
  const rem = Math.round(sec - min * 60)
  return `事务中 · ${min}m ${rem}s`
}

export function txnGroupAriaLabel(): string {
  return '手动事务'
}
