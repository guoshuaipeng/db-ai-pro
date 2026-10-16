export const DEFAULT_TAB_TITLE = '查询'
export const TAB_TITLE_MAX = 48

/** Trim / collapse spaces; empty → fallback; clamp length. */
export function sanitizeTabTitle(input: string, fallback = DEFAULT_TAB_TITLE): string {
  const cleaned = input.replace(/\s+/g, ' ').trim()
  const base = (fallback.replace(/\s+/g, ' ').trim() || DEFAULT_TAB_TITLE)
  if (!cleaned) return base.slice(0, TAB_TITLE_MAX)
  return cleaned.slice(0, TAB_TITLE_MAX)
}
