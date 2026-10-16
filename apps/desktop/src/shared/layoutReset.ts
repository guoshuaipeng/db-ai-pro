/** Layout splitter double-click reset copy (M102). */

import { LAYOUT } from './layoutBounds'

export type LayoutResetTarget = 'sidebar' | 'editor' | 'ai' | 'all'

export function layoutResetToast(target: LayoutResetTarget): string {
  if (target === 'sidebar') return '已恢复默认连接栏宽度'
  if (target === 'editor') return '已恢复默认编辑器 / 结果区比例'
  if (target === 'ai') return '已恢复默认助手宽度'
  return '已重置布局分栏'
}

export function layoutSplitterAriaLabel(base: string): string {
  return `${base} · 双击恢复默认`
}

export function layoutResetDefaults() {
  return {
    sidebarWidth: LAYOUT.sidebarDefault,
    aiWidth: LAYOUT.aiDefault,
    editorRatio: LAYOUT.editorRatioDefault,
  } as const
}
