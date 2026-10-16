/** Status bar health / connection info helpers (M69 / M131). */

import { formatLatency, type ConnHealth, type HealthTone } from './connHealth'
import {
  connectionEndpointText,
  type ConnectionEndpointSource,
} from './connectionEndpoint'

export type StatusHealthView = {
  text: string
  tone: HealthTone | 'idle'
  title: string
}

/** Label for the active-connection health chip in the status bar. */
export function statusHealthView(health: ConnHealth | undefined): StatusHealthView {
  if (!health) {
    return { text: '点击探测', tone: 'idle', title: '点击探测当前连接延迟' }
  }
  if (health.unsupported) {
    return {
      text: '不支持',
      tone: 'unsupported',
      title: health.error ?? '当前类型暂不支持延迟探测',
    }
  }
  if (!health.ok) {
    return {
      text: '失败',
      tone: 'bad',
      title: health.error ?? '连接探测失败，点击重试',
    }
  }
  return {
    text: formatLatency(health.latencyMs),
    tone: health.tone,
    title: `延迟 ${formatLatency(health.latencyMs)} · 点击重新探测`,
  }
}

/** Compact endpoint for the status bar (no password). */
export function statusBarEndpointSummary(
  source: ConnectionEndpointSource,
  max = 40,
): string {
  const full = connectionEndpointText(source).trim()
  if (!full) return ''

  if (source.dialect === 'sqlite') {
    const normalized = full.replace(/\\/g, '/')
    const base = normalized.split('/').filter(Boolean).pop() || normalized
    if (base.length <= max) return base
    return `…${base.slice(-(max - 1))}`
  }

  const host = (source.host ?? '').trim() || '127.0.0.1'
  const infoPort = source.port
  const portPart = infoPort != null ? `:${infoPort}` : ''
  const db = (source.database ?? '').trim()
  const dbPart = db ? `/${db}` : ''
  const compact = `${host}${portPart}${dbPart}`
  if (compact.length <= max) return compact
  return `${compact.slice(0, max - 1)}…`
}

/** Tooltip for the connection status control. */
export function statusBarConnectionTitle(healthTitle: string, endpointSummary = ''): string {
  const base = healthTitle.trim() || '当前连接'
  const ep = endpointSummary.trim()
  const epPart = ep ? `地址 ${ep}` : ''
  return [base, epPart, '单击探测 · Ctrl+单击在对象树中显示 · Alt+单击复制地址']
    .filter(Boolean)
    .join(' · ')
}

export function statusBarDisconnectedLabel(): string {
  return '未连接'
}

export function statusBarDisconnectedTitle(): string {
  return '尚未选择连接。单击可新建连接。'
}

export function statusBarCopyEndpointHint(): string {
  return '复制连接地址（不含密码）'
}
