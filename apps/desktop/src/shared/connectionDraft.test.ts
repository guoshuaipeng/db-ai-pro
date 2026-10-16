import { describe, expect, it } from 'vitest'
import {
  connectionDialectHelp,
  connectionNamePlaceholder,
  validateConnectionDraft,
} from './connectionDraft'

describe('validateConnectionDraft', () => {
  it('requires name', () => {
    expect(
      validateConnectionDraft({
        name: '  ',
        dialect: 'sqlite',
        filePath: '/tmp/a.db',
        host: '',
        port: '',
      }),
    ).toContain('名称')
  })

  it('requires sqlite path', () => {
    expect(
      validateConnectionDraft({
        name: 'demo',
        dialect: 'sqlite',
        filePath: '',
        host: '',
        port: '',
      }),
    ).toContain('文件')
  })

  it('requires host and validates port for server dialects', () => {
    expect(
      validateConnectionDraft({
        name: 'demo',
        dialect: 'mysql',
        filePath: '',
        host: '',
        port: '3306',
      }),
    ).toContain('主机')
    expect(
      validateConnectionDraft({
        name: 'demo',
        dialect: 'mysql',
        filePath: '',
        host: '127.0.0.1',
        port: 'abc',
      }),
    ).toContain('数字')
    expect(
      validateConnectionDraft({
        name: 'demo',
        dialect: 'mysql',
        filePath: '',
        host: '127.0.0.1',
        port: '99999',
      }),
    ).toContain('65535')
    expect(
      validateConnectionDraft({
        name: 'demo',
        dialect: 'mysql',
        filePath: '',
        host: '127.0.0.1',
        port: '3306',
      }),
    ).toBeNull()
  })
})

describe('connectionDialectHelp', () => {
  it('mentions sample db for sqlite and 显示的库 for mysql', () => {
    expect(connectionDialectHelp('sqlite')).toContain('示例库')
    expect(connectionDialectHelp('mysql')).toContain('显示的库')
    expect(connectionNamePlaceholder('redis')).toContain('Redis')
  })
})
