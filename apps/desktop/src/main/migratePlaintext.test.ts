import { describe, expect, it } from 'vitest'
import { migrateConnectionPlaintext, migrateSettingsPlaintext } from './migratePlaintext'
import type { SealResult } from './secrets'

const sealOk = (plain: string): SealResult => ({ ok: true, cipher: `cipher:${plain}` })
const sealFail = (_plain: string): SealResult => ({ ok: false, reason: 'unavailable' })

describe('migrateConnectionPlaintext', () => {
  it('seals plaintext password and drops the field', () => {
    const { row, changed } = migrateConnectionPlaintext({ id: '1', password: 'secret' }, sealOk)
    expect(changed).toBe(true)
    expect(row.password).toBeUndefined()
    expect(row.passwordCipher).toBe('cipher:secret')
  })

  it('keeps plaintext when sealing is unavailable', () => {
    const { row, changed } = migrateConnectionPlaintext({ id: '1', password: 'secret' }, sealFail)
    expect(changed).toBe(false)
    expect(row.password).toBe('secret')
    expect(row.passwordCipher).toBeUndefined()
  })

  it('keeps existing cipher and only strips plaintext', () => {
    const { row } = migrateConnectionPlaintext(
      { id: '1', password: 'old', passwordCipher: 'already' },
      sealOk,
    )
    expect(row.passwordCipher).toBe('already')
    expect(row.password).toBeUndefined()
  })
})

describe('migrateSettingsPlaintext', () => {
  it('seals apiKey', () => {
    const { settings, changed } = migrateSettingsPlaintext({ apiKey: 'k' }, sealOk)
    expect(changed).toBe(true)
    expect(settings.apiKey).toBeUndefined()
    expect(settings.apiKeyCipher).toBe('cipher:k')
  })
})
