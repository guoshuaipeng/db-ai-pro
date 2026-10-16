/** Result-grid column display order (independent of hide/show). */

import { baseResultColumns } from './resultColumnVisibility'

/** Merge saved order with current columns: keep known order, append new cols. */
export function normalizeColumnOrder(columns: string[], order: readonly string[]): string[] {
  const base = baseResultColumns(columns)
  const baseSet = new Set(base)
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of order) {
    if (!baseSet.has(name) || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  for (const name of base) {
    if (!seen.has(name)) out.push(name)
  }
  return out
}

/** Apply order to a visible subset (drops hidden / unknown). */
export function orderVisibleColumns(order: readonly string[], visible: readonly string[]): string[] {
  const vis = new Set(visible)
  const out = order.filter((name) => vis.has(name))
  // Append any visible not in order (defensive)
  for (const name of visible) {
    if (!out.includes(name)) out.push(name)
  }
  return out
}

/** Swap column with its neighbor in the full order list. */
export function moveColumnInOrder(
  order: readonly string[],
  column: string,
  delta: -1 | 1,
): string[] {
  const next = [...order]
  const i = next.indexOf(column)
  if (i < 0) return next
  const j = i + delta
  if (j < 0 || j >= next.length) return next
  const tmp = next[i]!
  next[i] = next[j]!
  next[j] = tmp
  return next
}

/**
 * Move among currently visible columns only (skip hidden neighbors).
 * Swaps the target with the adjacent visible column inside the full order.
 */
export function moveColumnAmongVisible(
  order: readonly string[],
  visible: readonly string[],
  column: string,
  delta: -1 | 1,
): string[] {
  const visOrdered = orderVisibleColumns(order, visible)
  const i = visOrdered.indexOf(column)
  if (i < 0) return [...order]
  const j = i + delta
  if (j < 0 || j >= visOrdered.length) return [...order]
  const other = visOrdered[j]!
  const next = [...order]
  const ia = next.indexOf(column)
  const ib = next.indexOf(other)
  if (ia < 0 || ib < 0) return next
  const tmp = next[ia]!
  next[ia] = next[ib]!
  next[ib] = tmp
  return next
}

export function canMoveColumnInOrder(order: readonly string[], column: string, delta: -1 | 1): boolean {
  const i = order.indexOf(column)
  if (i < 0) return false
  const j = i + delta
  return j >= 0 && j < order.length
}

export function canMoveColumnAmongVisible(
  order: readonly string[],
  visible: readonly string[],
  column: string,
  delta: -1 | 1,
): boolean {
  const visOrdered = orderVisibleColumns(order, visible)
  const i = visOrdered.indexOf(column)
  if (i < 0) return false
  const j = i + delta
  return j >= 0 && j < visOrdered.length
}

export function resetColumnOrder(): string[] {
  return []
}
