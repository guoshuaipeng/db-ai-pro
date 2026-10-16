import type { SchemaNode, StatementResult } from '@shared/types'
import type { SqlTarget } from './target'
import type { Connection } from 'mysql2/promise'
import type { Client } from 'pg'
import type Database from 'better-sqlite3'
import { describeMysql, executeMysql, listMysqlSchema, openMysql, type ServerLogin } from './mysql'
import { describeMssql, executeMssql, listMssqlSchema, openMssql } from './mssql'
import { describePostgres, executePostgres, listPostgresSchema, openPostgres } from './postgres'
import { closeRedis, listRedisSchema, probeRedis, scanRedisKeys } from './redis'
import { databaseExists, describeSchema, executeScript, listSchema, openDatabase } from './sqlite'

export type { SqlTarget } from './target'

export type QueryCancelReason = 'cancel' | 'timeout'

export class QueryCancelledError extends Error {
  readonly reason: QueryCancelReason

  constructor(reason: QueryCancelReason = 'cancel') {
    super(reason === 'timeout' ? '查询已超时并取消' : '查询已取消')
    this.name = 'QueryCancelledError'
    this.reason = reason
  }
}

type Live =
  | { kind: 'sqlite'; db: Database.Database; stamp: string }
  | { kind: 'mysql'; conn: Connection; stamp: string }
  | { kind: 'postgres'; client: Client; stamp: string }
  | { kind: 'mssql'; pool: import('mssql').ConnectionPool; stamp: string }

const live = new Map<string, Live>()

type ActiveQuery = {
  connectionId: string
  reason: QueryCancelReason | null
  abort: () => void
}

const activeQueries = new Map<string, ActiveQuery>()

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
    port: target.port ?? (target.dialect === 'postgresql' ? 5432 : target.dialect === 'sqlserver' ? 1433 : 3306),
    user: target.username?.trim() ?? '',
    password: target.password ?? '',
    database: target.database.trim(),
  }
}

async function release(row: Live): Promise<void> {
  try {
    if (row.kind === 'sqlite') row.db.close()
    else if (row.kind === 'mysql') await row.conn.end()
    else if (row.kind === 'postgres') await row.client.end()
    else await row.pool.close()
  } catch {
    /* already closed */
  }
}

/** Hard-kill an open session so in-flight driver work aborts when possible. */
async function killSession(connectionId: string): Promise<void> {
  const row = live.get(connectionId)
  if (!row) return
  live.delete(connectionId)
  try {
    if (row.kind === 'sqlite') {
      try {
        const interrupt = (row.db as unknown as { interrupt?: () => void }).interrupt
        interrupt?.()
      } catch {
        /* ignore */
      }
      try {
        row.db.close()
      } catch {
        /* ignore */
      }
      return
    }
    if (row.kind === 'mysql') {
      try {
        row.conn.destroy()
      } catch {
        /* ignore */
      }
      return
    }
    if (row.kind === 'postgres') {
      try {
        const stream = (row.client as unknown as { connection?: { stream?: { destroy?: () => void } } }).connection
          ?.stream
        stream?.destroy?.()
      } catch {
        /* ignore */
      }
      try {
        await row.client.end()
      } catch {
        /* ignore */
      }
      return
    }
    try {
      await row.pool.close()
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

export async function closeSession(id: string): Promise<void> {
  const row = live.get(id)
  if (row) {
    live.delete(id)
    await release(row)
  }
  await closeRedis(id)
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
  if (target.dialect === 'sqlserver') {
    return { kind: 'mssql', pool: await openMssql(loginOf(target)), stamp }
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
  if (target.dialect === 'redis') {
    await probeRedis(target)
    return
  }
  const created = await connect(target)
  try {
    if (created.kind === 'sqlite') created.db.prepare('SELECT 1').get()
    else if (created.kind === 'mysql') await created.conn.query('SELECT 1')
    else if (created.kind === 'postgres') await created.client.query('SELECT 1')
    else await created.pool.request().query('SELECT 1')
  } finally {
    await release(created)
  }
}

export async function schemaForSession(target: SqlTarget): Promise<SchemaNode> {
  if (target.dialect === 'redis') {
    const keys = await scanRedisKeys(target, '*', 120)
    return listRedisSchema(target, keys)
  }
  const session = await openSession(target)
  if (session.kind === 'sqlite') {
    return listSchema(target.id, target.name, target.filePath ?? '', session.db)
  }
  if (session.kind === 'mysql') return listMysqlSchema(session.conn, target)
  if (session.kind === 'postgres') return listPostgresSchema(session.client, target)
  return listMssqlSchema(session.pool, target)
}

export type ExecuteSessionOptions = {
  requestId?: string
  /** Soft timeout in ms. 0 / undefined = no timeout. */
  timeoutMs?: number
}

async function runOnSession(target: SqlTarget, sql: string): Promise<StatementResult[]> {
  if (target.dialect === 'redis') throw new Error('Redis 请使用键浏览器，而不是 SQL 编辑器')
  const session = await openSession(target)
  if (session.kind === 'sqlite') return executeScript(session.db, sql)
  if (session.kind === 'mysql') return executeMysql(session.conn, sql)
  if (session.kind === 'postgres') return executePostgres(session.client, sql)
  return executeMssql(session.pool, sql)
}

export async function executeSession(
  target: SqlTarget,
  sql: string,
  opts: ExecuteSessionOptions = {},
): Promise<StatementResult[]> {
  const requestId = opts.requestId ?? ''
  const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : 0

  let settled = false
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  const clearActive = () => {
    if (requestId) activeQueries.delete(requestId)
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }

  const abortLive = (reason: QueryCancelReason) => {
    const active = requestId ? activeQueries.get(requestId) : undefined
    if (active) active.reason = reason
    void killSession(target.id)
  }

  if (requestId) {
    activeQueries.set(requestId, {
      connectionId: target.id,
      reason: null,
      abort: () => abortLive('cancel'),
    })
  }

  const work = (async () => {
    try {
      return await runOnSession(target, sql)
    } catch (error) {
      const active = requestId ? activeQueries.get(requestId) : undefined
      if (active?.reason) throw new QueryCancelledError(active.reason)
      throw error
    } finally {
      settled = true
      clearActive()
    }
  })()

  if (!timeoutMs) return work

  return await new Promise<StatementResult[]>((resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      if (settled) return
      abortLive('timeout')
    }, timeoutMs)

    work.then(resolve, reject)
  }).finally(() => {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  })
}

/** Cancel an in-flight executeSession by requestId (kills the connection as drivers allow). */
export async function cancelQuery(requestId: string): Promise<{ ok: boolean }> {
  const active = activeQueries.get(requestId)
  if (!active) return { ok: false }
  active.reason = 'cancel'
  active.abort()
  return { ok: true }
}

export async function describeSession(target: SqlTarget): Promise<string> {
  if (target.dialect === 'redis') return ''
  const session = await openSession(target)
  if (session.kind === 'sqlite') return describeSchema(session.db)
  if (session.kind === 'mysql') return describeMysql(session.conn)
  if (session.kind === 'postgres') return describePostgres(session.client)
  return describeMssql(session.pool)
}
