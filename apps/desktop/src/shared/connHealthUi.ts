/** Connection latency probe badges & toasts (M168). */

import { formatLatency, type ConnHealth, type HealthProbeSummary } from './connHealth'

export function healthBadgeIdleLabel(): string {
  return '未测'
}

export function healthBadgeIdleTitle(): string {
  return '尚未探测延迟。点击徽章探测，或在连接菜单中「检测延迟」。'
}

export function healthBadgeUnsupportedLabel(): string {
  return '—'
}

export function healthBadgeFailLabel(): string {
  return '失败'
}

export function healthBadgeTitle(health: ConnHealth): string {
  if (health.unsupported) {
    return health.error?.trim() || '当前类型暂不支持延迟探测'
  }
  if (!health.ok) {
    return (health.error?.trim() || '连接探测失败') + ' · 点击重试'
  }
  const when = formatCheckedAt(health.checkedAt)
  return `延迟 ${formatLatency(health.latencyMs)} · ${when} · 点击重新探测`
}

export function formatCheckedAt(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return '刚刚'
  try {
    return new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return '刚刚'
  }
}

export function healthProbeOkToast(name: string, latencyMs: number): string {
  const n = name.trim() || '连接'
  return `「${n}」延迟 ${formatLatency(latencyMs)}`
}

export function healthProbeFailToast(name: string, error?: string): string {
  const n = name.trim() || '连接'
  const detail = error?.trim()
  return detail ? `「${n}」探测失败：${detail}` : `「${n}」探测失败`
}

export function healthProbeUnsupportedToast(name: string, error?: string): string {
  const n = name.trim() || '连接'
  const detail = error?.trim()
  return detail ? `「${n}」${detail}` : `「${n}」暂不支持延迟探测`
}

export function healthProbeBatchToast(summary: HealthProbeSummary): string {
  const { total, ok, bad, unsupported } = summary
  if (total <= 0) return '没有可探测的连接'
  const parts = [`已检测 ${total.toLocaleString('zh-CN')} 个连接`]
  if (ok > 0) parts.push(`正常 ${ok.toLocaleString('zh-CN')}`)
  if (bad > 0) parts.push(`失败 ${bad.toLocaleString('zh-CN')}`)
  if (unsupported > 0) parts.push(`不支持 ${unsupported.toLocaleString('zh-CN')}`)
  return parts.join(' · ')
}

export function healthProbeMenuLabel(): string {
  return '检测延迟'
}

export function healthProbeMenuTitle(): string {
  return '探测此连接的往返延迟，并更新树旁徽章'
}
