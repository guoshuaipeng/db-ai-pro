/** Connection color-tag menu & toast copy (M174). */

import { CONN_COLOR_TAGS } from './connGroups'

export function connColorGroupLabel(): string {
  return '颜色'
}

export function connColorGroupAria(): string {
  return '连接颜色标记'
}

export function connColorClearTitle(): string {
  return '清除颜色标记（标签条恢复中性）'
}

export function connColorClearAria(): string {
  return '无颜色标记'
}

export function connColorTagTitle(tagId: string): string {
  const hit = CONN_COLOR_TAGS.find((row) => row.id === tagId)
  const label = hit?.label ?? tagId
  return `标记为${label}色（查询标签左侧色条）`
}

export function connColorTagAria(tagId: string): string {
  const hit = CONN_COLOR_TAGS.find((row) => row.id === tagId)
  const label = hit?.label ?? tagId
  return `${label}色标记`
}

export function connColorTagDisplayName(tagId: string | null | undefined): string {
  if (!tagId) return '无'
  const hit = CONN_COLOR_TAGS.find((row) => row.id === tagId)
  return hit ? `${hit.label}色` : tagId
}

export function connColorSetToast(connectionName: string, tagId: string): string {
  const name = connectionName.trim() || '连接'
  return `「${name}」已标记为${connColorTagDisplayName(tagId)}`
}

export function connColorClearedToast(connectionName: string): string {
  const name = connectionName.trim() || '连接'
  return `「${name}」已清除颜色标记`
}

export function connColorMissingToast(): string {
  return '连接不存在，无法更新颜色标记'
}

export function connColorDialogFieldLabel(): string {
  return '颜色标记'
}

export function connColorDialogHint(): string {
  return '颜色会显示在对象树与查询标签左侧，便于区分环境。'
}
