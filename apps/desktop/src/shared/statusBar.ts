/** Status bar health / action label helpers (M69). */

import { formatLatency, type ConnHealth, type HealthTone } from './connHealth'

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