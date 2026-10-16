import type { TableSpec } from './schema'
import { tableLabel } from './labels'

export type TableHit = {
  name: string
  label: string
  score: number
  reason: string
}

const SYNONYMS: Record<string, string[]> = {
  customers: ['客户', '用户', '会员', 'buyer', 'customer'],
  orders: ['订单', '下单', '交易', 'order'],
  order_items: ['明细', '行项目', '订单项', 'item'],
  products: ['商品', '产品', '品类', 'sku', 'product'],
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\u4e00-\u9fff\w]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function searchRelevantTables(tables: TableSpec[], prompt: string, limit = 4): TableHit[] {
  const needles = tokens(prompt)
  if (needles.length === 0) {
    return tables.slice(0, limit).map((table) => ({
      name: table.name,
      label: tableLabel(table.name),
      score: 1,
      reason: '默认候选',
    }))
  }

  const scored = tables.map((table) => {
    const label = tableLabel(table.name)
    const bag = new Set([
      table.name.toLowerCase(),
      label.toLowerCase(),
      ...(SYNONYMS[table.name] ?? []).map((item) => item.toLowerCase()),
      ...table.columns.map((column) => column.name.toLowerCase()),
    ])
    let score = 0
    const reasons: string[] = []
    for (const needle of needles) {
      if (bag.has(needle)) {
        score += 5
        reasons.push(`命中 ${needle}`)
        continue
      }
      for (const item of bag) {
        if (item.includes(needle) || needle.includes(item)) {
          score += 2
          reasons.push(`相近 ${needle}`)
          break
        }
      }
    }
    return {
      name: table.name,
      label,
      score,
      reason: reasons.slice(0, 2).join(' · ') || '弱相关',
    }
  })

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  const strong = scored.filter((item) => item.score > 0)
  return (strong.length > 0 ? strong : scored).slice(0, limit)
}

export function schemaForTables(tables: TableSpec[], names: string[]): string {
  const wanted = new Set(names.map((name) => name.toLowerCase()))
  const picked = tables.filter((table) => wanted.has(table.name.toLowerCase()))
  const source = picked.length > 0 ? picked : tables.slice(0, 4)
  return source
    .map((table) => {
      const cols = table.columns
        .map((column) => `${column.name} ${column.dataType}`.trim())
        .join(', ')
      return `${table.name}（${tableLabel(table.name)}）: ${cols}`
    })
    .join('\n')
}

export function enumHints(tables: TableSpec[], tableName: string, columnHints: string[] = []): string {
  const table = tables.find((item) => item.name.toLowerCase() === tableName.toLowerCase())
  if (!table) return ''
  const columns = columnHints.length
    ? table.columns.filter((column) =>
        columnHints.some((hint) => column.name.toLowerCase().includes(hint.toLowerCase())),
      )
    : table.columns.filter((column) => /status|region|category|state|type/i.test(column.name))
  if (columns.length === 0) return ''
  return columns
    .map((column) => `${table.name}.${column.name} 适合做枚举过滤（具体取值请结合业务常识，勿编造）`)
    .join('\n')
}
