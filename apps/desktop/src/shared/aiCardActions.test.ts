import { describe, expect, it } from 'vitest'
import {
  aiApplyAllSqlButtonLabel,
  aiApplyAllSqlButtonTitle,
  aiReuseUserPromptToast,
  aiStepsSummary,
  joinSqlBlocksForCopy,
  listClosedSqlBlocks,
  shouldCollapseAiSteps,
} from './aiCardActions'

describe('listClosedSqlBlocks / joinSqlBlocksForCopy', () => {
  it('extracts closed fences', () => {
    const content = '先看表\n```sql\nSELECT 1;\n```\n再查\n```sql\nSELECT 2;\n```'
    expect(listClosedSqlBlocks(content)).toEqual(['SELECT 1;', 'SELECT 2;'])
    expect(joinSqlBlocksForCopy(content)).toBe('SELECT 1;\n\nSELECT 2;')
  })

  it('returns null when no closed sql', () => {
    expect(joinSqlBlocksForCopy('只有说明')).toBeNull()
    expect(joinSqlBlocksForCopy('```sql\nSELECT 1')).toBeNull()
  })
})

describe('shouldCollapseAiSteps', () => {
  it('stays open while streaming', () => {
    expect(shouldCollapseAiSteps(10, true)).toBe(false)
  })

  it('collapses when finished and long', () => {
    expect(shouldCollapseAiSteps(3, false)).toBe(false)
    expect(shouldCollapseAiSteps(4, false)).toBe(true)
  })
})

describe('aiStepsSummary', () => {
  it('formats count', () => {
    expect(aiStepsSummary(5)).toBe('5 个步骤')
  })
})

describe('ai message action copy', () => {
  it('labels apply-all by block count', () => {
    expect(aiApplyAllSqlButtonTitle(1)).toContain('SQL')
    expect(aiApplyAllSqlButtonTitle(3)).toContain('3')
    expect(aiApplyAllSqlButtonLabel(2)).toContain('2')
    expect(aiReuseUserPromptToast()).toContain('输入框')
  })
})

