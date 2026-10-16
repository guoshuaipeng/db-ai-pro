/** Tab ↔ connection binding toolbar copy (M162). */

import type { ConnectionPublic } from './types'
import { dialectInfo } from './types'

export function tabConnectionKicker(): string {
  return '标签连接'
}

export function tabConnectionLabel(): string {
  return '连接'
}

export function tabConnectionSelectTitle(): string {
  return '当前查询标签绑定的连接（可与侧栏活动连接不同）'
}

export function tabConnectionAria(): string {
  return '当前标签连接'
}

export function tabConnectionEmptyTitle(): string {
  return '没有可绑定的 SQL 连接'
}

export function tabConnectionEmptyBody(): string {
  return '先新建或导入可执行 SQL 的连接（非 Redis）。绑定后，此标签的运行/解释会走该连接。'
}

export function tabConnectionDisconnectedHint(name: string): string {
  const n = name.trim() || '该连接'
  return `「${n}」当前不可用或已断开，运行前请检查连接或改绑其他库。`
}

export function tabConnectionBoundToast(connection: ConnectionPublic): string {
  const dialect = dialectInfo(connection.dialect).label
  return `本标签已绑定：${dialect} · ${connection.name}`
}

export function tabConnectionClearedToast(): string {
  return '本标签已改用侧栏活动连接'
}

export function tabConnectionNoneOption(): string {
  return '无可用连接'
}

export function tabConnectionMissingOption(name: string, disconnected: boolean): string {
  const prefix = disconnected ? '已断开 · ' : ''
  return `${prefix}${name}`
}

export function tabConnectionStatusOk(name: string, dialectLabel: string): string {
  return `绑定中：${dialectLabel} · ${name}`
}

export function tabConnectionFollowActiveLabel(): string {
  return '跟随侧栏'
}
