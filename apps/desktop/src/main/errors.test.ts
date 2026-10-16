import { describe, expect, it } from 'vitest'
import { explainDbError } from './errors'

describe('explainDbError', () => {
  it('turns connection failures into short Chinese', () => {
    expect(explainDbError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:3306' })).toContain('没有服务')
    expect(explainDbError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND db.internal' })).toContain('找不到这台主机')
    expect(explainDbError({ code: 'ETIMEDOUT', message: 'connect ETIMEDOUT' })).toContain('超时')
    expect(explainDbError({ code: 'ER_ACCESS_DENIED_ERROR', errno: 1045, message: 'Access denied' })).toBe('账号或密码不正确。')
    expect(explainDbError({ code: '28P01', message: 'password authentication failed' })).toBe('账号或密码不正确。')
    expect(explainDbError({ code: 'ER_BAD_DB_ERROR', errno: 1049, message: 'Unknown database' })).toBe('数据库不存在。')
    expect(explainDbError({ code: 'ER_DBACCESS_DENIED_ERROR', errno: 1044, message: 'Access denied' })).toContain('不能访问这个数据库')
    expect(explainDbError({ code: '3D000', message: 'database "missing" does not exist' })).toBe('数据库不存在。')
  })

  it('keeps SQL text from the server', () => {
    const message = "You have an error in your SQL syntax near 'FROM'"
    expect(explainDbError(new Error(message))).toBe(message)
  })
})
