import Redis from 'ioredis'
import type { SchemaNode } from '@shared/types'
import type { SqlTarget } from './target'

export type RedisLogin = {
  host: string
  port: number
  password?: string
  db: number
}

export type RedisKeyType = 'string' | 'hash' | 'list' | 'zset' | 'set' | 'stream' | 'none' | 'unknown'

export type RedisKeyInfo = {
  key: string
  type: RedisKeyType
  ttl: number
}

export type RedisValueView =
  | { kind: 'string'; value: string }
  | { kind: 'hash'; fields: { field: string; value: string }[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'zset'; items: { member: string; score: number }[] }
  | { kind: 'set'; members: string[] }
  | { kind: 'unsupported'; redisType: string; note: string }

const live = new Map<string, { client: Redis; stamp: string }>()

function stampOf(target: SqlTarget): string {
  return [target.host ?? '', String(target.port ?? ''), target.password ?? '', target.database ?? '0'].join('\0')
}

export function redisLogin(target: SqlTarget): RedisLogin {
  if (!target.host?.trim()) throw new Error('请填写主机')
  const dbRaw = (target.database ?? '0').trim()
  const db = Number(dbRaw)
  if (!Number.isInteger(db) || db < 0) throw new Error('Redis 数据库号必须是非负整数')
  return {
    host: target.host.trim(),
    port: target.port ?? 6379,
    password: target.password || undefined,
    db,
  }
}

function createClient(login: RedisLogin): Redis {
  return new Redis({
    host: login.host,
    port: login.port,
    password: login.password,
    db: login.db,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    connectTimeout: 8000,
  })
}

async function release(client: Redis): Promise<void> {
  try {
    client.disconnect()
  } catch {
    /* ignore */
  }
}

export async function closeRedis(id: string): Promise<void> {
  const row = live.get(id)
  if (!row) return
  live.delete(id)
  await release(row.client)
}

export async function openRedis(target: SqlTarget): Promise<Redis> {
  const stamp = stampOf(target)
  const cached = live.get(target.id)
  if (cached && cached.stamp === stamp) return cached.client
  if (cached) await closeRedis(target.id)
  const client = createClient(redisLogin(target))
  await client.connect()
  await client.ping()
  live.set(target.id, { client, stamp })
  return client
}

export async function probeRedis(target: SqlTarget): Promise<void> {
  const client = createClient(redisLogin(target))
  try {
    await client.connect()
    await client.ping()
  } finally {
    await release(client)
  }
}

export async function scanRedisKeys(target: SqlTarget, pattern = '*', count = 120): Promise<RedisKeyInfo[]> {
  const client = await openRedis(target)
  const keys: string[] = []
  let cursor = '0'
  do {
    const [next, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 50)
    cursor = next
    for (const key of batch) {
      keys.push(key)
      if (keys.length >= count) break
    }
  } while (cursor !== '0' && keys.length < count)

  const infos: RedisKeyInfo[] = []
  for (const key of keys) {
    const type = (await client.type(key)) as RedisKeyType
    const ttl = await client.ttl(key)
    infos.push({ key, type, ttl })
  }
  return infos
}

export async function readRedisValue(target: SqlTarget, key: string): Promise<RedisValueView> {
  const client = await openRedis(target)
  const redisType = await client.type(key)
  if (redisType === 'none') return { kind: 'unsupported', redisType: 'none', note: '键不存在或已过期' }
  if (redisType === 'string') {
    const value = (await client.get(key)) ?? ''
    return { kind: 'string', value }
  }
  if (redisType === 'hash') {
    const raw = await client.hgetall(key)
    return {
      kind: 'hash',
      fields: Object.entries(raw).map(([field, value]) => ({ field, value })),
    }
  }
  if (redisType === 'list') {
    const items = await client.lrange(key, 0, 199)
    return { kind: 'list', items }
  }
  if (redisType === 'zset') {
    const raw = await client.zrange(key, 0, 199, 'WITHSCORES')
    const items: { member: string; score: number }[] = []
    for (let i = 0; i < raw.length; i += 2) {
      items.push({ member: raw[i] ?? '', score: Number(raw[i + 1] ?? 0) })
    }
    return { kind: 'zset', items }
  }
  if (redisType === 'set') {
    const members = await client.smembers(key)
    return { kind: 'set', members: members.slice(0, 200) }
  }
  return { kind: 'unsupported', redisType, note: `暂不支持展示 ${redisType} 类型` }
}

export function listRedisSchema(target: SqlTarget, keys: RedisKeyInfo[]): SchemaNode {
  const dbName = `db${(target.database ?? '0').trim() || '0'}`
  const keyNodes: SchemaNode[] = keys.map((item) => ({
    id: `${target.id}:key:${item.key}`,
    kind: 'key',
    name: item.key,
    displayName: item.key,
    dialect: 'redis',
    connectionId: target.id,
    dataType: item.type,
    redisKey: item.key,
    redisType: item.type,
    ttl: item.ttl,
  }))

  return {
    id: target.id,
    kind: 'connection',
    name: target.name,
    displayName: target.name,
    dialect: 'redis',
    connectionId: target.id,
    status: 'ok',
    children: [
      {
        id: `${target.id}:db`,
        kind: 'database',
        name: dbName,
        displayName: dbName,
        dialect: 'redis',
        connectionId: target.id,
        children:
          keyNodes.length > 0
            ? keyNodes
            : [
                {
                  id: `${target.id}:empty`,
                  kind: 'note',
                  name: 'empty-keys',
                  displayName: '还没有键',
                  note: '可用 SCAN 刷新，或换一个匹配模式。',
                  connectionId: target.id,
                },
              ],
      },
    ],
  }
}
