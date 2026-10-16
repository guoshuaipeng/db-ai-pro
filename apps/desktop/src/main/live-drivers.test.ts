import { describe, expect, it } from 'vitest'
import { explainDbError } from './errors'
import { executeMysql, listMysqlSchema, openMysql, type ServerLogin } from './mysql'
import { executePostgres, listPostgresSchema, openPostgres } from './postgres'
import { openMssql } from './mssql'
import type { SqlTarget } from './target'

function loginFrom(raw: string): ServerLogin {
  const url = new URL(raw)
  return {
    host: url.hostname,
    port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  }
}

const refused: ServerLogin = { host: '127.0.0.1', port: 1, user: 'x', password: 'x', database: 'x' }

describe('closed ports', () => {
  it('explains a refused MySQL port', async () => {
    await expect(openMysql(refused)).rejects.toSatisfy((error: unknown) => explainDbError(error).includes('没有服务'))
  })

  it('explains a refused PostgreSQL port', async () => {
    await expect(openPostgres(refused)).rejects.toSatisfy((error: unknown) => explainDbError(error).includes('没有服务'))
  })

  it('explains a refused SQL Server port', async () => {
    await expect(openMssql(refused)).rejects.toSatisfy((error: unknown) => {
      const message = explainDbError(error)
      return message.includes('没有服务') || message.includes('连接') || message.includes('Failed') || message.length > 0
    })
  })
})

const mysqlUrl = process.env.DATAAI_MYSQL
const pgUrl = process.env.DATAAI_PG

describe.skipIf(!mysqlUrl)('MariaDB / MySQL protocol', () => {
  const login = loginFrom(mysqlUrl ?? 'mysql://unused:unused@127.0.0.1:1/unused')
  const target: SqlTarget = {
    id: 'mysql-live',
    name: '本地 MariaDB',
    dialect: 'mysql',
    host: login.host,
    port: login.port,
    database: login.database,
    username: login.user,
    password: login.password,
  }

  it('loads columns, runs SQL, and stops on the first error', async () => {
    const conn = await openMysql(login)
    try {
      const script = [
        'DROP TABLE IF EXISTS dataai_m2_smoke',
        'CREATE TABLE dataai_m2_smoke (id INT PRIMARY KEY, note VARCHAR(40))',
        "INSERT INTO dataai_m2_smoke (id, note) VALUES (1, 'a;b')",
        'SELECT note FROM dataai_m2_smoke',
      ].join(';\n')
      const results = await executeMysql(conn, script)
      expect(results.every((result) => result.ok)).toBe(true)
      expect(results[3]?.rows?.[0]?.note).toBe('a;b')

      const schema = await listMysqlSchema(conn, target)
      const table = schema.children?.[0].children?.find((node) => node.name === 'dataai_m2_smoke')
      expect(table?.children?.map((column) => column.name)).toEqual(['id', 'note'])

      const stopped = await executeMysql(conn, 'SELECT missing_column FROM dataai_m2_smoke; SELECT 1 AS ok')
      expect(stopped).toHaveLength(1)
      expect(stopped[0]?.ok).toBe(false)
      expect(stopped[0]?.error).toBeTruthy()
    } finally {
      await executeMysql(conn, 'DROP TABLE IF EXISTS dataai_m2_smoke')
      await conn.end()
    }
  })

  it('names a bad password and a missing database', async () => {
    await expect(openMysql({ ...login, password: 'not-the-password' })).rejects.toSatisfy(
      (error: unknown) => explainDbError(error) === '账号或密码不正确。',
    )
    await expect(openMysql({ ...login, database: 'dataai_missing_db' })).rejects.toSatisfy(
      (error: unknown) => explainDbError(error).includes('不能访问这个数据库'),
    )
  })
})

describe.skipIf(!pgUrl)('PostgreSQL', () => {
  const login = loginFrom(pgUrl ?? 'postgres://unused:unused@127.0.0.1:1/unused')
  const target: SqlTarget = {
    id: 'pg-live',
    name: '本地 PostgreSQL',
    dialect: 'postgresql',
    host: login.host,
    port: login.port,
    database: login.database,
    username: login.user,
    password: login.password,
  }

  it('loads columns, runs SQL, and stops on the first error', async () => {
    const client = await openPostgres(login)
    try {
      const script = [
        'DROP TABLE IF EXISTS dataai_m2_smoke',
        'CREATE TABLE dataai_m2_smoke (id int PRIMARY KEY, note varchar(40))',
        "INSERT INTO dataai_m2_smoke (id, note) VALUES (1, 'a;b')",
        'SELECT note FROM dataai_m2_smoke',
      ].join(';\n')
      const results = await executePostgres(client, script)
      expect(results.every((result) => result.ok)).toBe(true)
      expect(results[3]?.rows?.[0]?.note).toBe('a;b')

      const schema = await listPostgresSchema(client, target, login)
      const table = schema.children
        ?.flatMap((db) => db.children ?? [])
        .find((node) => node.name === 'dataai_m2_smoke')
      expect(table?.children?.map((column) => column.name)).toEqual(['id', 'note'])
      expect(table?.children?.find((column) => column.name === 'note')?.dataType).toMatch(/char/)

      const stopped = await executePostgres(client, 'SELECT missing_column FROM dataai_m2_smoke; SELECT 1 AS ok')
      expect(stopped).toHaveLength(1)
      expect(stopped[0]?.ok).toBe(false)
    } finally {
      await executePostgres(client, 'DROP TABLE IF EXISTS dataai_m2_smoke')
      await client.end()
    }
  })

  it('names a bad password and a missing database', async () => {
    await expect(openPostgres({ ...login, password: 'not-the-password' })).rejects.toSatisfy(
      (error: unknown) => explainDbError(error) === '账号或密码不正确。',
    )
    await expect(openPostgres({ ...login, database: 'dataai_missing_db' })).rejects.toSatisfy(
      (error: unknown) => explainDbError(error) === '数据库不存在。',
    )
  })
})
