/** Slow-query feedback copy (M171). */

import { formatElapsedMs } from './slowQuery'

export function slowQueryNotifTitle(): string {
  return '慢查询'
}

export function slowQueryNotifDetail(
  elapsedMs: number,
  thresholdMs: number,
  connectionName: string,
): string {
  const name = connectionName.trim() || '连接'
  return `${formatElapsedMs(elapsedMs)}（阈值 ${formatElapsedMs(thresholdMs)}）· ${name}`
}

export function slowQueryToast(
  elapsedMs: number,
  thresholdMs: number,
  connectionName: string,
): string {
  const name = connectionName.trim() || '连接'
  return `慢查询：${formatElapsedMs(elapsedMs)}（阈值 ${formatElapsedMs(thresholdMs)}）· ${name}`
}

export function slowQueryBannerTitle(): string {
  return '本次查询偏慢'
}

export function slowQueryBannerBody(elapsedMs: number, thresholdMs: number): string {
  return `耗时 ${formatElapsedMs(elapsedMs)}，已超过阈值 ${formatElapsedMs(thresholdMs)}。可在历史中筛选慢查询，或在设置中调整阈值。`
}

export function slowQueryBannerOpenHistoryLabel(): string {
  return '查看慢查询历史'
}

export function slowQueryThresholdSettingLabel(): string {
  return '慢查询阈值（毫秒）'
}

export function slowQueryThresholdSettingHint(): string {
  return '运行耗时达到该值时视为慢查询，并可用于历史筛选与通知。'
}

export function slowQueryThresholdSavedToast(ms: number): string {
  return `慢查询阈值已设为 ${Math.round(ms).toLocaleString('zh-CN')} ms`
}

export function slowQueryNotifySettingTitle(): string {
  return '通知：慢查询'
}

export function slowQueryNotifySettingBody(): string {
  return '运行超过慢查询阈值时写入通知中心。关闭后仍会在结果区提示，并弹出 Toast。'
}

export function slowQueryNotifyEnabledToast(): string {
  return '已开启慢查询通知'
}

export function slowQueryNotifyDisabledToast(): string {
  return '已关闭慢查询通知（结果区与 Toast 仍会提示）'
}
