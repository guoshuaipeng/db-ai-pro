/** Query soft-timeout / cancel / running-status helpers (M140). */

import { clampQueryTimeoutSec } from './prefs'
import { formatElapsedMs } from './slowQuery'

/** Common soft-timeout presets (seconds). 0 = unlimited. */
export const QUERY_TIMEOUT_PRESETS = [0, 15, 30, 60, 120] as const

export function queryTimeoutPresetLabel(sec: number): string {
  if (sec <= 0) return '不限制'
  return `${sec} 秒`
}

export function queryTimeoutPolicySummary(sec: number): string {
  const n = clampQueryTimeoutSec(sec)
  if (n <= 0) {
    return '当前不自动取消查询；执行中可随时点「取消」或按 Esc。'
  }
  return `软超时 ${n} 秒：超时后会自动取消；执行中也可手动取消。`
}

export function queryTimeoutHint(): string {
  return '默认 30 秒。本地大表或慢网关可调大；0 表示不自动取消。危险语句仍会先确认。'
}

/** Remaining soft-timeout budget in ms, or null when unlimited / unknown. */
export function softTimeoutRemainingMs(
  elapsedMs: number,
  timeoutSec: number,
): number | null {
  const limit = clampQueryTimeoutSec(timeoutSec)
  if (limit <= 0) return null
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return limit * 1000
  return Math.max(0, limit * 1000 - elapsedMs)
}

export function runningElapsedLabel(elapsedMs: number, timeoutSec: number): string {
  const base = `执行中 · ${formatElapsedMs(elapsedMs)}`
  const remain = softTimeoutRemainingMs(elapsedMs, timeoutSec)
  if (remain == null) return base
  if (remain <= 0) return `${base} · 即将超时取消`
  return `${base} · 剩 ${formatElapsedMs(remain)}`
}

export function runningElapsedTitle(elapsedMs: number, timeoutSec: number): string {
  const limit = clampQueryTimeoutSec(timeoutSec)
  if (limit <= 0) {
    return `查询执行中（已 ${formatElapsedMs(elapsedMs)}）。未设置软超时，可点工具栏「取消」或 Esc。`
  }
  const remain = softTimeoutRemainingMs(elapsedMs, timeoutSec) ?? 0
  if (remain <= 0) {
    return `查询执行中（已 ${formatElapsedMs(elapsedMs)}）。软超时 ${limit} 秒已到，正在取消…`
  }
  return `查询执行中（已 ${formatElapsedMs(elapsedMs)}）。软超时 ${limit} 秒，约剩 ${formatElapsedMs(remain)}。`
}

export function cancelRunButtonTitle(timeoutSec: number): string {
  const limit = clampQueryTimeoutSec(timeoutSec)
  if (limit <= 0) {
    return '取消正在执行的查询（Esc）。当前未设置软超时。'
  }
  return `取消正在执行的查询（Esc）。软超时 ${limit} 秒后也会自动取消。`
}

/** Validate settings draft string; null = ok. */
export function validateQueryTimeoutDraft(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return '请填写软超时秒数（0 = 不限制）'
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return '软超时必须是数字'
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return '软超时必须是数字'
  if (n < 0) return '软超时不能为负数'
  if (n > 600) return '软超时最多 600 秒'
  return null
}

export function queryTimeoutSavedNote(sec: number): string {
  const n = clampQueryTimeoutSec(sec)
  if (n === 0) return '已关闭软超时（查询不会自动取消）。'
  return `软超时已设为 ${n} 秒；超时后会自动取消查询。`
}
