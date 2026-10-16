import { describe, expect, it } from 'vitest'
import {
  defaultPyQtConfigPath,
  mapPyQtConnectionRow,
  mapPyQtConnectionRows,
  mapPyQtDialect,
} from './pyqtMigrate'

describe('mapPyQtDialect', () => {
  it('maps known aliases', () => {
    expect(mapPyQtDialect('mysql')).toBe('mysql')
    expect(mapPyQtDialect('PostgreSQL')).toBe('postgresql')
    expect(mapPyQtDialect('postgres')).toBe('postgresql')
    expect(mapPyQtDialect('mssql')).toBe('sqlserver')
    expect(mapPyQtDialect('sqlite')).toBe('sqlite')
    expect(mapPyQtDialect('redis')).toBe('redis')
  })

  it('returns null for unknown', () => {
    expect(mapPyQtDialect('oracle')).toBeNull()
    expect(mapPyQtDialect('')).toBeNull()
  })
})

describe('defaultPyQtConfigPath', () => {
  it('builds Windows-style path', () => {
    expect(defaultPyQtConfigPath('C:\\Users\\user')).toBe('C:\\Users\\user\\.db-ai\\config.db')
  })

  it('builds POSIX path', () => {
    expect(defaultPyQtConfigPath('/home/alice')).toBe('/home/alice/.db-ai/config.db')
  })
})

describe('mapPyQtConnectionRow', () => {
  it('maps mysql with passwordPlain and drops zero port', () => {
    const row = mapPyQtConnectionRow({
      id: 'c1',
      name: 'prod',
      db_type: 'mysql',
      host: '10.0.0.1',
      port: 3306,
      database_name: 'app',
      username: 'root',
      password: 'secret',
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-02T00:00:00',
    })
    expect(row).toMatchObject({
      id: 'c1',
      name: 'prod',
      dialect: 'mysql',
      host: '10.0.0.1',
      port: 3306,
      database: 'app',
      username: 'root',
      passwordPlain: 'secret',
    })
    expect(row?.passwordCipher).toBeUndefined()
  })

  it('maps sqlite file path from database_name', () => {
    const row = mapPyQtConnectionRow({
      id: 's1',
      name: 'local',
      db_type: 'sqlite',
      host: '',
      port: 0,
      database_name: 'C:\\Users\\user\\.db-ai\\config.db',
      username: '',
      password: '',
    })
    expect(row).toMatchObject({
      dialect: 'sqlite',
      filePath: 'C:\\Users\\user\\.db-ai\\config.db',
      passwordPlain: undefined,
    })
    expect(row?.port).toBeUndefined()
    expect(row?.host).toBeUndefined()
  })

  it('skips empty name and unknown dialect', () => {
    expect(mapPyQtConnectionRow({ id: 'x', name: '  ', db_type: 'mysql' })).toBeNull()
    expect(mapPyQtConnectionRow({ id: 'x', name: 'x', db_type: 'oracle' })).toBeNull()
  })
})

describe('mapPyQtConnectionRows', () => {
  it('counts skipped rows', () => {
    const { mapped, skipped } = mapPyQtConnectionRows([
      { id: '1', name: 'ok', db_type: 'mysql', host: 'h', port: 1, database_name: 'd' },
      { id: '2', name: 'bad', db_type: 'oracle' },
      { id: '3', name: '', db_type: 'mysql' },
    ])
    expect(mapped).toHaveLength(1)
    expect(skipped).toBe(2)
  })
})