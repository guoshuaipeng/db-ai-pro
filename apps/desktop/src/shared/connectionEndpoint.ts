/** Format a connection address for clipboard (no password) — M85. */

import { dialectInfo, type Dialect } from './types'

export type ConnectionEndpointSource = {
  dialect: Dialect
  host?: string
  port?: number
  database?: string
  filePath?: string
  username?: string
}

/** SQLite → file path; others → `dialect://[user@]host:port[/db]` (no password). */
export function connectionEndpointText(source: ConnectionEndpointSource): string {
  if (source.dialect === 'sqlite') {
    return (source.filePath ?? '').trim()
  }
  const info = dialectInfo(source.dialect)
  const host = (source.host ?? '').trim() || '127.0.0.1'
  const port = source.port ?? info.defaultPort
  const portPart = port != null ? `:${port}` : ''
  const user = (source.username ?? '').trim()
  const auth = user ? `${user}@` : ''
  const db = (source.database ?? '').trim()
  const dbPart = db ? `/${db}` : ''
  return `${source.dialect}://${auth}${host}${portPart}${dbPart}`
}

export function connectionEndpointCopiedToast(text: string): string {
  const clipped = text.length > 56 ? `${text.slice(0, 55)}…` : text
  return `已复制地址 ${clipped}`
}
