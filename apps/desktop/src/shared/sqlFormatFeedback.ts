/** Toast copy after format SQL (M110). */

export function sqlFormatDoneToast(input: {
  changed: boolean
  fromSelection: boolean
}): string {
  if (!input.changed) {
    return input.fromSelection ? '选中 SQL 已是格式化状态' : 'SQL 已是格式化状态'
  }
  return input.fromSelection ? '已格式化选中 SQL' : '已格式化 SQL'
}

export function sqlFormatDoneTone(changed: boolean): 'success' | 'info' {
  return changed ? 'success' : 'info'
}
