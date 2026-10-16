import type { Dialect } from '@shared/types'

export type SqlTarget = {
  id: string
  name: string
  dialect: Dialect
  filePath?: string
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
}
