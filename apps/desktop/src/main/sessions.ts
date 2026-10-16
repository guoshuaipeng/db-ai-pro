import type { SchemaNode, StatementResult } from '@shared/types'
import type { SqlTarget } from './target'
import type { Connection } from 'mysql2/promise'
import type { Client } from 'pg'
import type Database from 'better-sqlite3'
import { describeMysql, executeMysql, listMysqlSchema, openMysql, type ServerLogin } from './mysql'
import { describePostgres, executePostgres, listPostgresSchema, openPostgres } from './postgres'
import { databaseExists, describeSchema, executeScript, listSchema, openDatabase } from './sqlite'

export type { SqlTarget } from './target'

type Live =
  | { kind: 'sqlite'; db: Database.Database; stamp: string }
  | { kind: 'mysql'; conn: Connection; stamp: string }
  | { kind: 'postgres'; client: Client; stamp: string }

const live = new Map<string, Live>()

function stampOf(target: SqlTarget): string {
  return [
    target.dialect,
    target.filePath ?? '',
    target.host ?? '',
    String(target.port ?? ''),
    target.database ?? '',
    target.username ?? '',
    target.password ?? '',
  ].join('\0')
}

function loginOf(target: SqlTarget): ServerLogin {
  if (!target.host?.trim()) throw new Error('请填写主机')
  if (!target.database?.trim()) throw new Error('请填写数据库名')
  return {
    host: target.host.trim(),
    port: target.port ?? (target.dialect === 'postgresql' ? 5432 : 3306),
    user: target.username?.trim() ?? '',
    password: target.password ?? '',
    database: target.database.trim(),
  }
}

async function release(row: Live): Promise<void> {
  try {
    if (row.kind === 'sqlite') row.db.close()
    else if (row.kind === 'mysql') await row.conn.end()
    else await row.client.end()
  } catch {
    /* already closed */
  }
}

export async function closeSession(id: string): Promise<void> {
  const row = live.get(id)
  if (!row) return
  live.delete(id)
  await release(row)
}

export async function closeAllSessions(): Promise<void> {
  await Promise.all([...live.keys()].map((id) => closeSession(id)))
}

async function connect(target: SqlTarget): Promise<Live> {
  const stamp = stampOf(target)
  if (target.dialect === 'sqlite') {
    if (!target.filePath || !databaseExists(target.filePath)) throw new Error('找不到数据库文件')
    return { kind: 'sqlite', db: openDatabase(target.filePath), stamp }
  }
  if (target.dialect === 'mysql' || target.dialect === 'mariadb') {
    return { kind: 'mysql', conn: await openMysql(loginOf(target)), stamp }
  }
  if (target.dialect === 'postgresql') {
    return { kind: 'postgres', client: await openPostgres(loginOf(target)), stamp }
  }
  throw new Error('这个类型还不能查询')
}

export async function openSession(target: SqlTarget): Promise<Live> {
  const stamp = stampOf(target)
  const cached = live.get(target.id)
  if (cached && cached.stamp === stamp) return cached
  if (cached) await closeSession(target.id)
  const created = await connect(target)
  live.set(target.id, created)
  return created
}

export async function probeTarget(target: SqlTarget): Promise<void> {
  const created = await connect(target)
  try {
    if (created.kind === 'sqlite') created.db.prepare('SELECT 1').get()
    else if (created.kind === 'mysql') await created.conn.query('SELECT 1')
    else await created.client.query('SELECT 1')
  } finally {
    await release(created)
  }
}

export async function schemaForSession(target: SqlTarget): Promise<SchemaNode> {
  const session = await openSession(target)
  if (session.kind === 'sqlite') {
    return listSchema(target.id, target.name, target.filePath ?? '', session.db)
  }
  if (session.kind === 'mysql') return listMysqlSchema(session.conn, target)
  return listPostgresSchema(session.client, target)
}

export async function executeSession(target: SqlTarget, sql: string): Promise<StatementResult[]> {
  const session = await openSession(target)
  if (session.kind === 'sqlite') return executeScript(session.db, sql)
  if (session.kind === 'mysql') return executeMysql(session.conn, sql)
  return executePostgres(session.client, sql)
}

export async function describeSession(target: SqlTarget): Promise<string> {
  const session = await openSession(target)
  if (session.kind === 'sqlite') return describeSchema(session.db)
  if (session.kind === 'mysql') return describeMysql(session.conn)
  return describePostgres(session.client)
}
