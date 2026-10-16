import { safeStorage } from 'electron'

export type SealResult =
  | { ok: true; cipher: string }
  | { ok: false; reason: 'unavailable' }

export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function sealSecret(plain: string): SealResult {
  if (!plain) return { ok: true, cipher: '' }
  if (!encryptionAvailable()) return { ok: false, reason: 'unavailable' }
  const buffer = safeStorage.encryptString(plain)
  return { ok: true, cipher: buffer.toString('base64') }
}

export function openSecret(cipher: string | undefined): string {
  if (!cipher) return ''
  if (!encryptionAvailable()) return ''
  try {
    return safeStorage.decryptString(Buffer.from(cipher, 'base64'))
  } catch {
    return ''
  }
}
