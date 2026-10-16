type ErrorRecord = {
  code?: string
  errno?: number
  message?: string
}

export function explainDbError(error: unknown): string {
  const record = (error ?? {}) as ErrorRecord
  const code = String(record.code ?? '')
  const message = error instanceof Error ? error.message : String(record.message ?? error ?? '连接失败')

  if (code === 'ECONNREFUSED') return '无法连接：目标端口没有服务在监听。'
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return '找不到这台主机。请检查主机名。'
  if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || /timeout/i.test(message)) {
    return '连接超时。请检查主机、端口和网络。'
  }
  if (
    code === 'ECONNRESET' ||
    code === 'PROTOCOL_CONNECTION_LOST' ||
    /connection terminated|server closed the connection/i.test(message)
  ) {
    return '连接已断开。请再试一次。'
  }
  if (code === 'ER_ACCESS_DENIED_ERROR' || code === '28P01' || code === 'ELOGIN' || record.errno === 1045) return '账号或密码不正确。'
  if (code === 'ESOCKET' && /Failed to connect/i.test(message)) return '无法连接：目标端口没有服务在监听。'
  if (code === 'ER_BAD_DB_ERROR' || code === '3D000' || record.errno === 1049) return '数据库不存在。'
  if (code === '28000') return '账号没有登录权限。'
  if (code === 'ER_DBACCESS_DENIED_ERROR' || record.errno === 1044) {
    return '不能访问这个数据库。它可能不存在，或这个账号没有权限。'
  }
  return message
}
