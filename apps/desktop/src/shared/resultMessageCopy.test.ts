import { describe, expect, it } from 'vitest'
import {
  resultMessageCopiedToast,
  resultMessageCopyKind,
  resultMessageCopyText,
} from './resultMessageCopy'

describe('resultMessageCopyText', () => {
  it('normalizes empty and CRLF', () => {
    expect(resultMessageCopyText(undefined)).toBe('')
    expect(resultMessageCopyText('a\r\nb')).toBe('a\nb')
  })
})

describe('resultMessageCopyKind', () => {
  it('detects empty / plan / message', () => {
    expect(resultMessageCopyKind('plan', '  ')).toBe('empty')
    expect(resultMessageCopyKind('plan', 'Seq Scan')).toBe('plan')
    expect(resultMessageCopyKind('message', 'ERROR: boom')).toBe('message')
  })
})

describe('resultMessageCopiedToast', () => {
  it('returns chinese toasts', () => {
    expect(resultMessageCopiedToast('empty')).toContain('没有')
    expect(resultMessageCopiedToast('plan')).toContain('执行计划')
    expect(resultMessageCopiedToast('message')).toContain('输出')
  })
})
