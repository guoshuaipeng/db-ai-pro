import { describe, expect, it } from 'vitest'
import {
  APP_VERSION_LABEL,
  RELEASE_NOTES_SNIPPET,
  aboutChannelLabel,
  aboutDiagnosticsText,
  aboutEncryptionLabel,
  aboutVersionBadge,
  aboutVersionCopyText,
  releaseNotesTitle,
} from './releaseNotes'

describe('releaseNotes', () => {
  it('tracks current label and snippet', () => {
    expect(APP_VERSION_LABEL).toBe('3.100.0')
    expect(RELEASE_NOTES_SNIPPET.items.length).toBeGreaterThan(2)
    expect(releaseNotesTitle('3.100.0')).toContain('3.100.0')
    expect(releaseNotesTitle('3.100.0')).toContain('近期更新')
  })

  it('formats about copy helpers', () => {
    expect(aboutVersionBadge('3.100.0')).toBe('v3.100.0')
    expect(aboutVersionCopyText('v3.100.0')).toBe('3.100.0')
    expect(aboutChannelLabel('desktop')).toContain('桌面')
    expect(aboutChannelLabel('preview')).toContain('预览')
    expect(aboutEncryptionLabel('os')).toContain('可用')
    const diag = aboutDiagnosticsText({
      version: '3.100.0',
      encryption: 'os',
      mode: 'desktop',
    })
    expect(diag).toContain('DataAI 3.100.0')
    expect(diag).toContain('通道')
    expect(diag).toContain('密钥')
  })
})
