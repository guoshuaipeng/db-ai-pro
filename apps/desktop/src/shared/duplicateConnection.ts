/** Suggest a unique name when duplicating a connection (M83). */

export function nextDuplicateConnectionName(name: string, existingNames: readonly string[]): string {
  const base = name.trim() || '连接'
  const taken = new Set(existingNames.map((item) => item.trim()).filter(Boolean))
  const first = `${base} 副本`
  if (!taken.has(first)) return first
  let n = 2
  while (taken.has(`${base} 副本 ${n}`)) n += 1
  return `${base} 副本 ${n}`
}
