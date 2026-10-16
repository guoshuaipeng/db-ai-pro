import { describe, expect, it } from 'vitest'
import {
  ACCENT_OPTIONS,
  accentChangedToast,
  accentLabel,
  appearanceThemeTitle,
} from './appearanceTheme'

describe('appearanceTheme', () => {
  it('lists accents and copy', () => {
    expect(ACCENT_OPTIONS.map((row) => row.id)).toEqual(['azure', 'mint', 'violet'])
    expect(accentLabel('mint')).toContain('薄荷')
    expect(accentChangedToast('violet')).toContain('雾紫')
    expect(appearanceThemeTitle()).toContain('强调色')
  })
})
