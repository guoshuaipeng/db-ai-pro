import { describe, expect, it } from 'vitest'
import {
  editorDropHintBody,
  editorDropHintTitle,
  editorDropOpenedToast,
  editorDropRejectedToast,
} from './sqlFileDropUi'

describe('sqlFileDropUi', () => {
  it('exposes Chinese drop copy', () => {
    expect(editorDropHintTitle('file')).toContain('文件')
    expect(editorDropHintBody('snippet')).toContain('插入')
    expect(editorDropOpenedToast(2)).toContain('2')
    expect(editorDropRejectedToast(1)).toContain('忽略')
  })
})
