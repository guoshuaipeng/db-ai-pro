/** Redis browser copy & helpers (M154). */

import type { RedisKeyInfo, RedisValueView } from './types'

export const REDIS_SCAN_PRESETS = ['*', 'user:*', 'session:*', 'cache:*'] as const

export function redisKicker(): string {
  return 'Redis'
}

export function redisNoConnectionTitle(): string {
  return '先选择一个 Redis 连接'
}

export function redisNoConnectionBody(): string {
  return '在对象树或连接列表中打开 Redis 实例后，即可 SCAN 键并预览值。'
}

export function redisNoKeysTitle(): string {
  return '没有匹配的键'
}

export function redisNoKeysBody(pattern: string): string {
  const p = pattern.trim() || '*'
  return `模式「${p}」下未扫到键。可改成 * 或 user:* 后再次 SCAN。`
}

export function redisPickKeyTitle(): string {
  return '从左侧选择一个键'
}

export function redisPickKeyBody(): string {
  return '点击键名可读取 STRING / HASH / LIST / SET / ZSET。支持复制键名与值。'
}

export function redisKeysHeading(count: number): string {
  return `键 · ${count}`
}

export function redisValueHeading(): string {
  return '值'
}

export function redisScanLabel(loading: boolean): string {
  return loading ? '扫描中…' : 'SCAN'
}

export function redisTtlLabel(ttl: number): string {
  if (ttl < 0) return '持久'
  if (ttl < 60) return `TTL ${ttl}s`
  if (ttl < 3600) return `TTL ${Math.round(ttl / 60)}m`
  if (ttl < 86400) return `TTL ${Math.round(ttl / 3600)}h`
  return `TTL ${Math.round(ttl / 86400)}d`
}

export function redisTypeLabel(type: string): string {
  const t = type.trim().toLowerCase()
  if (t === 'string') return 'STRING'
  if (t === 'hash') return 'HASH'
  if (t === 'list') return 'LIST'
  if (t === 'set') return 'SET'
  if (t === 'zset' || t === 'sortedset') return 'ZSET'
  if (t === 'unsupported' || t === 'other') return '不支持'
  return type.toUpperCase() || '未知'
}

export function formatRedisValueClipboard(value: RedisValueView): string {
  if (value.kind === 'string') return value.value
  if (value.kind === 'hash') {
    return value.fields.map((f) => `${f.field}\t${f.value}`).join('\n')
  }
  if (value.kind === 'list') return value.items.join('\n')
  if (value.kind === 'set') return value.members.join('\n')
  if (value.kind === 'zset') {
    return value.items.map((item) => `${item.member}\t${item.score}`).join('\n')
  }
  return value.note
}

export function redisValueIsEmpty(value: RedisValueView): boolean {
  if (value.kind === 'string') return value.value.length === 0
  if (value.kind === 'hash') return value.fields.length === 0
  if (value.kind === 'list') return value.items.length === 0
  if (value.kind === 'set') return value.members.length === 0
  if (value.kind === 'zset') return value.items.length === 0
  return false
}

export function redisKeyCopiedToast(): string {
  return '已复制键名'
}

export function redisValueCopiedToast(): string {
  return '已复制键值'
}

export function redisCopyKeyLabel(): string {
  return '复制键名'
}

export function redisCopyValueLabel(): string {
  return '复制值'
}

export function redisEmptyValueTitle(kind: string): string {
  return `${redisTypeLabel(kind)} 为空`
}

export function redisEmptyValueBody(): string {
  return '该键存在但没有可显示的成员/字段。可在别处写入后再刷新。'
}

export function redisScanHint(): string {
  return 'SCAN 匹配模式'
}

export function redisValueMeta(info: RedisKeyInfo | null, value: RedisValueView | null): string {
  const parts: string[] = []
  if (info) {
    parts.push(redisTypeLabel(info.type))
    parts.push(redisTtlLabel(info.ttl))
  } else if (value) {
    parts.push(redisTypeLabel(value.kind === 'unsupported' ? value.redisType : value.kind))
  }
  return parts.join(' · ')
}
