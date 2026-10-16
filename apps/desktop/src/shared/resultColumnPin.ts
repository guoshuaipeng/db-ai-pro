/** Result-grid sticky / pin-left columns (max N). */

export const MAX_PINNED_RESULT_COLUMNS = 2

export type PinColumnAction = 'pin' | 'unpin' | 'replace'

export type TogglePinResult = {
  next: string[]
  action: PinColumnAction
  /** Column bumped off when action === 'replace'. */
  replaced?: string
}

/** Toggle pin; when at cap, drop the oldest pinned column (FIFO). */
export function togglePinnedColumns(
  pinned: readonly string[],
  column: string,
  max = MAX_PINNED_RESULT_COLUMNS,
): TogglePinResult {
  const cap = Math.max(1, max)
  if (pinned.includes(column)) {
    return { next: pinned.filter((name) => name !== column), action: 'unpin' }
  }
  if (pinned.length >= cap) {
    const replaced = pinned[0]
    return {
      next: [...pinned.slice(1), column],
      action: 'replace',
      replaced,
    }
  }
  return { next: [...pinned, column], action: 'pin' }
}

export function clearPinnedColumns(): string[] {
  return []
}

export function pinnedColumnToast(
  column: string,
  action: PinColumnAction,
  replaced?: string,
  max = MAX_PINNED_RESULT_COLUMNS,
): string {
  if (action === 'unpin') return `已取消固定列「${column}」`
  if (action === 'replace') {
    const was = replaced ? `「${replaced}」` : '最早固定的列'
    return `已固定「${column}」（替下 ${was}；最多 ${max} 列）`
  }
  return `已固定列「${column}」到左侧（最多 ${max} 列）`
}

export function clearPinnedColumnsToast(): string {
  return '已取消全部固定列'
}

export function pinColumnButtonTitle(pinned: boolean, max = MAX_PINNED_RESULT_COLUMNS): string {
  return pinned ? '取消固定列' : `固定到左侧（最多 ${max} 列）`
}
