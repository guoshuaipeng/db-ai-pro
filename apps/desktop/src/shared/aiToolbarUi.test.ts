import { describe, expect, it } from 'vitest'
import {
  aiIntentBlurb,
  aiIntentLabel,
  aiNoTablesTitle,
  aiToolbarModelPreviewLabel,
  aiToolbarTitle,
} from './aiToolbarUi'

describe('aiToolbarUi', () => {
  it('exposes Chinese toolbar copy', () => {
    expect(aiToolbarTitle('query')).toContain('SQL')
    expect(aiToolbarTitle('create')).toContain('建表')
    expect(aiIntentLabel('alter')).toBe('改表')
    expect(aiIntentBlurb('query')).toContain('表结构')
    expect(aiNoTablesTitle()).toContain('没有表')
    expect(aiToolbarModelPreviewLabel()).toContain('配置')
  })
})
