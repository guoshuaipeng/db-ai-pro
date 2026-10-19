import type { SchemaNode, StatementResult } from '@shared/types'
import type { SqlTarget } from './target'
import type { Connection } from 'mysql2/promise'
import type { Client } from 'pg'
import type Database from 'better-sqlite3'
import { describeMysql, executeMysql, listMysqlDatabases, listMysqlSchema, openMysql, type ServerLogin } from './mysql'
import { describeMssql, executeMssql, listMssqlDatabases, listMssqlSchema, openMssql } from './mssql'
import { describePostgres, executePostgres, listPostgresDatabases, listPostgresSchema, openPostgres } from './postgres'
import { closeRedis, listRedisSchema, probeRedis, pingRedis, scanRedisKeys } from './redis'
import { databaseExists, describeSchema, executeScript, listSchema, openDatabase } from './sqlite'
import {
  inspectMssqlTable,
  inspectMysqlTable,
  inspectPostgresTable,
  inspectSqliteTable,
} from './tableStructure'
import type { TableStructure } from '@shared/tableStructure'
import { supportsManualTransaction, transactionSql } from '@shared/transaction'
import sql from 'mssql'
import { getConnection } from './store'

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
  | {
      kind: 'mssql'
      pool: import('mssql').ConnectionPool
      stamp: string
      txn?: import('mssql').Transaction
    }

const live = new Map<string, Live>()
/** Connection ids with an open manual transaction (autocommit off). */
const openTxns = new Set<string>()

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
  const dialect = target.dialect
  const optionalDb = dialect === 'mysql' || dialect === 'mariadb'
  if (!optionalDb && !target.database?.trim()) throw new Error('请填写数据库名')
  return {
    host: target.host.trim(),
    port: target.port ?? (dialect === 'postgresql' ? 5432 : dialect === 'sqlserver' ? 1433 : 3306),
    user: target.username?.trim() ?? '',
    password: target.password ?? '',
    database: target.database?.trim() || (dialect === 'postgresql' ? 'postgres' : ''),
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
function clearTxn(connectionId: string): void {
  openTxns.delete(connectionId)
  const row = live.get(connectionId)
  if (row?.kind === 'mssql') row.txn = undefined
}

export function isInTransaction(connectionId: string): boolean {
  return openTxns.has(connectionId)
}

export function hasAnyOpenTransaction(): boolean {
  return openTxns.size > 0
}

export function openTransactionConnectionIds(): string[] {
  return [...openTxns]
}

async function killSession(connectionId: string): Promise<void> {
  const row = live.get(connectionId)
  if (!row) {
    clearTxn(connectionId)
    return
  }
  clearTxn(connectionId)
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
  clearTxn(id)
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
  if (cached) {
    if (openTxns.has(target.id)) {
      throw new Error('当前连接仍在事务中，请先提交或回滚后再更改连接参数')
    }
    await closeSession(target.id)
  }
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

export type PingSessionResult = {
  ok: boolean
  latencyMs: number
  error?: string
  unsupported?: boolean
}

/** SELECT 1 / PING on the live session when possible; measures round-trip ms. */
export async function pingSession(target: SqlTarget): Promise<PingSessionResult> {
  if (target.dialect === 'oracle' || target.dialect === 'hive') {
    return { ok: false, latencyMs: 0, unsupported: true, error: '当前类型暂不支持探测' }
  }
  const started = Date.now()
  try {
    if (target.dialect === 'redis') {
      await pingRedis(target)
    } else {
      const session = await openSession(target)
      if (session.kind === 'sqlite') session.db.prepare('SELECT 1').get()
      else if (session.kind === 'mysql') await session.conn.query('SELECT 1')
      else if (session.kind === 'postgres') await session.client.query('SELECT 1')
      else await session.pool.request().query('SELECT 1')
    }
    return { ok: true, latencyMs: Date.now() - started }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : '探测失败',
    }
  }
}

export async function schemaForSession(target: SqlTarget): Promise<SchemaNode> {
  if (target.dialect === 'redis') {
    const keys = await scanRedisKeys(target, '*', 120)
    return listRedisSchema(target, keys)
  }
  const session = await openSession(target)
  const whitelist = getConnection(target.id)?.visibleDatabases ?? null
  if (session.kind === 'sqlite') {
    return listSchema(target.id, target.name, target.filePath ?? '', session.db)
  }
  if (session.kind === 'mysql') return listMysqlSchema(session.conn, target, whitelist)
  if (session.kind === 'postgres') return listPostgresSchema(session.client, target, loginOf(target), whitelist)
  return listMssqlSchema(session.pool, target, whitelist)
}

export async function listInstanceDatabases(target: SqlTarget): Promise<string[]> {
  if (target.dialect === 'sqlite' || target.dialect === 'redis') return []
  const session = await openSession(target)
  if (session.kind === 'mysql') return listMysqlDatabases(session.conn)
  if (session.kind === 'postgres') return listPostgresDatabases(session.client)
  if (session.kind === 'mssql') return listMssqlDatabases(session.pool)
  return []
}

export type ExecuteSessionOptions = {
  requestId?: string
  /** Soft timeout in ms. 0 / undefined = no timeout. */
  timeoutMs?: number
  /** One-shot database override (PostgreSQL cross-DB browse). */
  database?: string
}

async function runOnSession(
  target: SqlTarget,
  sqlText: string,
  databaseOverride?: string,
): Promise<StatementResult[]> {
  if (target.dialect === 'redis') throw new Error('Redis 请使用键浏览器，而不是 SQL 编辑器')
  const override = databaseOverride?.trim()
  if (
    target.dialect === 'postgresql' &&
    override &&
    override !== (target.database ?? '').trim()
  ) {
    const login = { ...loginOf(target), database: override }
    const client = await openPostgres(login)
    try {
      return await executePostgres(client, sqlText)
    } finally {
      await client.end().catch(() => undefined)
    }
  }
  const session = await openSession(target)
  if (session.kind === 'sqlite') return executeScript(session.db, sqlText)
  if (session.kind === 'mysql') {
    if (override) {
      // Per-tab default DB: set before run so restore/bindings are honored (not last session USE).
      const safe = override.replace(/`/g, '``')
      await session.conn.query(`USE \`${safe}\``)
    }
    return executeMysql(session.conn, sqlText)
  }
  if (session.kind === 'postgres') return executePostgres(session.client, sqlText)
  if (override) {
    const safe = override.replace(/]/g, ']]')
    await session.pool.request().query(`USE [${safe}]`)
  }
  return executeMssql(session.pool, sqlText, session.txn)
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
      return await runOnSession(target, sql, opts.database)
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


export async function inspectTableSession(
  target: SqlTarget,
  tableName: string,
  databaseName?: string | null,
): Promise<TableStructure> {
  if (target.dialect === 'redis') throw new Error('Redis 没有表结构')
  const name = tableName.trim()
  if (!name) throw new Error('请指定表名')
  const session = await openSession(target)
  if (session.kind === 'sqlite') return inspectSqliteTable(session.db, target, name)
  if (session.kind === 'mysql') return inspectMysqlTable(session.conn, target, name, databaseName)
  if (session.kind === 'postgres') return inspectPostgresTable(session.client, target, name)
  return inspectMssqlTable(session.pool, target, name)
}

export type TxnStatus = { open: boolean; supported: boolean }

export function transactionStatus(target: SqlTarget): TxnStatus {
  const supported = supportsManualTransaction(target.dialect)
  return { open: openTxns.has(target.id), supported }
}

export async function beginTransaction(target: SqlTarget): Promise<TxnStatus> {
  if (!supportsManualTransaction(target.dialect)) throw new Error('当前数据库类型不支持手动事务')
  if (openTxns.has(target.id)) throw new Error('已经在事务中')
  const session = await openSession(target)
  if (session.kind === 'sqlite') {
    session.db.exec(transactionSql('sqlite', 'begin'))
  } else if (session.kind === 'mysql') {
    await session.conn.beginTransaction()
  } else if (session.kind === 'postgres') {
    await session.client.query(transactionSql('postgresql', 'begin'))
  } else {
    const txn = new sql.Transaction(session.pool)
    await txn.begin()
    session.txn = txn
    live.set(target.id, session)
  }
  openTxns.add(target.id)
  return transactionStatus(target)
}

export async function commitTransaction(target: SqlTarget): Promise<TxnStatus> {
  if (!openTxns.has(target.id)) throw new Error('当前没有未提交的事务')
  const session = await openSession(target)
  try {
    if (session.kind === 'sqlite') session.db.exec(transactionSql('sqlite', 'commit'))
    else if (session.kind === 'mysql') await session.conn.commit()
    else if (session.kind === 'postgres') await session.client.query(transactionSql('postgresql', 'commit'))
    else {
      if (!session.txn) throw new Error('事务状态丢失')
      await session.txn.commit()
      session.txn = undefined
    }
  } finally {
    clearTxn(target.id)
  }
  return transactionStatus(target)
}

export async function rollbackTransaction(target: SqlTarget): Promise<TxnStatus> {
  if (!openTxns.has(target.id)) throw new Error('当前没有未提交的事务')
  const session = live.get(target.id)
  try {
    if (!session) {
      clearTxn(target.id)
      return transactionStatus(target)
    }
    if (session.kind === 'sqlite') session.db.exec(transactionSql('sqlite', 'rollback'))
    else if (session.kind === 'mysql') await session.conn.rollback()
    else if (session.kind === 'postgres') await session.client.query(transactionSql('postgresql', 'rollback'))
    else if (session.txn) {
      await session.txn.rollback()
      session.txn = undefined
    }
  } catch {
    /* connection may already be dead after cancel */
  } finally {
    clearTxn(target.id)
  }
  return transactionStatus(target)
}

