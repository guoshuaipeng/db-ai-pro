import { describe, expect, it } from 'vitest'
import {
  snippetExpandedPreview,
  snippetInsertToast,
  snippetTemplateVarsBadge,
  snippetVarLabel,
  snippetVarPlaceholder,
} from './snippetInsert'

describe('snippetInsert', () => {
  it('labels common vars in Chinese', () => {
    expect(snippetVarLabel('table')).toBe('表名')
    expect(snippetVarLabel('limit')).toBe('行数上限')
    expect(snippetVarPlaceholder('table')).toContain('orders')
    expect(snippetTemplateVarsBadge('SELECT * FROM {{table}} LIMIT {{limit}}')).toContain('{{table}}')
    expect(snippetInsertToast('COUNT(*)')).toContain('COUNT')
    expect(snippetExpandedPreview('SELECT {{x}}', { x: '1' })).toBe('SELECT 1')
  })
})
