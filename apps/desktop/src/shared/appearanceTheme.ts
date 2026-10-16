/** Dark-theme accent & appearance copy (M148). */

import type { UiAccent } from './prefs'

export type AccentOption = {
  id: UiAccent
  label: string
  swatch: string
  blurb: string
}

export const ACCENT_OPTIONS: readonly AccentOption[] = [
  {
    id: 'azure',
    label: '霁青蓝',
    swatch: '#9eb4ff',
    blurb: '默认强调色，偏冷静专业。',
  },
  {
    id: 'mint',
    label: '薄荷青',
    swatch: '#7dd3c0',
    blurb: '偏清爽，适合长时间盯结果集。',
  },
  {
    id: 'violet',
    label: '雾紫',
    swatch: '#c4b5fd',
    blurb: '偏柔和，突出 AI 与次要操作。',
  },
]

export function accentLabel(id: UiAccent): string {
  return ACCENT_OPTIONS.find((row) => row.id === id)?.label ?? '霁青蓝'
}

export function accentChangedToast(id: UiAccent): string {
  return `已切换强调色：${accentLabel(id)}`
}

export function appearanceThemeLead(): string {
  return '深色工作区以低反光面板为主。可调强调色与高对比，让焦点、选中与主按钮更易辨认。'
}

export function appearanceThemeKicker(): string {
  return '深色主题'
}

export function appearanceThemeTitle(): string {
  return '观感与强调色'
}

export function highContrastHint(): string {
  return '提高文字与分割线对比，减弱半透明；适合强光环境或投影。'
}

export function densityComfortableBlurb(): string {
  return '更宽松的行距与内边距，适合浏览结果。'
}

export function densityCompactBlurb(): string {
  return '更紧凑的工具栏与树，适合小屏或多面板。'
}
