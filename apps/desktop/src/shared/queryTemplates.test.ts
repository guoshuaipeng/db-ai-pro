import { describe, expect, it } from 'vitest'
import {
  QUERY_TEMPLATES,
  getQueryTemplate,
  templateCommandId,
  templateIdFromCommand,
} from './queryTemplates'
import { extractSnippetVars } from './snippetVars'

describe('queryTemplates', () => {
  it('ships a small built-in set', () => {
    expect(QUERY_TEMPLATES.length).toBeGreaterThanOrEqual(6)
    expect(QUERY_TEMPLATES.length).toBeLessThanOrEqual(10)
    expect(new Set(QUERY_TEMPLATES.map((t) => t.id)).size).toBe(QUERY_TEMPLATES.length)
  })

  it('uses snippet vars on common templates', () => {
    const top = getQueryTemplate('selectTop')
    expect(top).toBeTruthy()
    expect(extractSnippetVars(top!.sql)).toEqual(['table', 'limit'])
    expect(extractSnippetVars(getQueryTemplate('selectCount')!.sql)).toEqual(['table'])
  })

  it('maps command ids', () => {
    expect(templateCommandId('selectTop')).toBe('query.tpl.selectTop')
    expect(templateIdFromCommand('query.tpl.selectTop')).toBe('selectTop')
    expect(templateIdFromCommand('query.run')).toBeNull()
  })
})
