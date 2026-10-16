/** Client-side connection dialog draft validation & help (M119). */

import type { Dialect } from './types'

export type ConnectionDraftFields = {
  name: string
  dialect: Dialect
  filePath: string
  host: string
  port: string
}

/** Returns a Chinese error message, or null when the draft is ready to save/test. */
export function validateConnectionDraft(fields: ConnectionDraftFields): string | null {
  if (!fields.name.trim()) return '请填写连接名称'
  if (fields.dialect === 'sqlite') {
    if (!fields.filePath.trim()) return '请选择或填写 SQLite 数据库文件路径'
    return null
  }
  if (!fields.host.trim()) return '请填写主机地址'
  const port = fields.port.trim()
  if (port) {
    if (!/^\d+$/.test(port)) return '端口必须是数字'
    const n = Number(port)
    if (n < 1 || n > 65535) return '端口需在 1–65535 之间'
  }
  return null
}

/** Short dialect-specific guidance under the type picker. */
export function connectionDialectHelp(dialect: Dialect): string {
  switch (dialect) {
    case 'sqlite':
      return '适合本地文件库。也可在侧栏或本对话框使用「改用示例库」快速体验。'
    case 'mysql':
    case 'mariadb':
      return '数据库名可留空；保存后用「显示的库」勾选要出现在对象树中的库。'
    case 'postgresql':
      return '默认库多为 postgres；保存后可在对象树浏览其他库，或用「显示的库」筛选。'
    case 'sqlserver':
      return '填写主机与可选数据库；可用「显示的库」调整实例上出现在树中的库。'
    case 'redis':
      return '用于浏览键值；数据库号可选。此类型暂不支持 SQL 查询。'
    case 'oracle':
    case 'hive':
      return '可先保存连接信息；当前版本还不能直接查询。'
    default:
      return '填写连接信息后可测试并保存到本机。'
  }
}

export function connectionNamePlaceholder(dialect: Dialect): string {
  switch (dialect) {
    case 'sqlite':
      return '例如：本地订单库'
    case 'redis':
      return '例如：缓存 Redis'
    default:
      return '例如：订单库'
  }
}
