import { describe, expect, it } from 'vitest'
import {
  ACCENT_OPTIONS,
  accentChangedToast,
  accentLabel,
  appearanceThemeTitle,
  densityChangedToast,
  densityCompactBlurb,
  densityComfortableTitle,
  densityLabel,
  densitySectionTitle,
} from './appearanceTheme'

describe('appearanceTheme', () => {
  it('lists accents and copy', () => {
    expect(ACCENT_OPTIONS.map((row) => row.id)).toEqual(['azure', 'mint', 'violet'])
    expect(accentLabel('mint')).toContain('薄荷')
    expect(accentChangedToast('violet')).toContain('雾紫')
    expect(appearanceThemeTitle()).toContain('强调色')
    expect(densityLabel('compact')).toBe('紧凑')
    expect(densityChangedToast('compact')).toContain('紧凑')
    expect(densityCompactBlurb()).toContain('一屏')
    expect(densityComfortableTitle()).toBe('舒适')
    expect(densitySectionTitle()).toContain('密度')
    expect(densityChangedToast('comfortable')).toContain('舒适')
  })
})
