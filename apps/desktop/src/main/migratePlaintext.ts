import type { SealResult } from './secrets'

type ConnectionLike = {
  password?: string
  passwordCipher?: string
  [key: string]: unknown
}

type SettingsLike = {
  apiKey?: string
  apiKeyCipher?: string
  [key: string]: unknown
}

export function migrateConnectionPlaintext(
  row: ConnectionLike,
  seal: (plain: string) => SealResult,
): { row: ConnectionLike; changed: boolean } {
  let changed = false
  const next: ConnectionLike = { ...row }

  if (typeof next.password === 'string' && next.password.length > 0) {
    if (!next.passwordCipher) {
      const sealed = seal(next.password)
      if (sealed.ok && sealed.cipher) {
        next.passwordCipher = sealed.cipher
        delete next.password
        changed = true
      }
      // Sealing unavailable: keep plaintext so a later launch can migrate.
    } else {
      delete next.password
      changed = true
    }
  } else if ('password' in next) {
    delete next.password
    changed = true
  }

  return { row: next, changed }
}

export function migrateSettingsPlaintext(
  stored: SettingsLike,
  seal: (plain: string) => SealResult,
): { settings: SettingsLike; changed: boolean } {
  let changed = false
  const next: SettingsLike = { ...stored }

  if (typeof next.apiKey === 'string' && next.apiKey.length > 0) {
    if (!next.apiKeyCipher) {
      const sealed = seal(next.apiKey)
      if (sealed.ok && sealed.cipher) {
        next.apiKeyCipher = sealed.cipher
        delete next.apiKey
        changed = true
      }
    } else {
      delete next.apiKey
      changed = true
    }
  } else if ('apiKey' in next) {
    delete next.apiKey
    changed = true
  }

  return { settings: next, changed }
}
