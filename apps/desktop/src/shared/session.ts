export const SQL = {
  customers: `SELECT
  c.id,
  c.name AS 客户,
  c.region AS 区域,
  c.city AS 城市,
  c.status AS 状态,
  c.email AS 邮箱
FROM customers AS c
ORDER BY c.id;`,
  regions: `SELECT
  c.region AS 区域,
  COUNT(o.id) AS 订单数,
  ROUND(SUM(o.total_cents) / 100.0, 2) AS 金额
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id
GROUP BY c.region
ORDER BY 金额 DESC;`,
  highValue: `SELECT
  o.id AS 订单号,
  c.name AS 客户,
  c.region AS 区域,
  ROUND(o.total_cents / 100.0, 2) AS 金额,
  o.status AS 状态,
  o.placed_at AS 下单日
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id
WHERE o.placed_at >= date('now', '-90 day')
  AND o.total_cents >= 50000
ORDER BY o.total_cents DESC;`,
  missingEmail: `SELECT
  c.name AS 客户,
  c.region AS 区域,
  c.city AS 城市,
  c.status AS 状态
FROM customers AS c
WHERE c.status = '活跃'
  AND (c.email IS NULL OR c.email = '')
ORDER BY c.region, c.name;`,
  status: `SELECT
  o.status AS 状态,
  COUNT(*) AS 订单数
FROM orders AS o
GROUP BY o.status
ORDER BY 订单数 DESC;`,
  category: `SELECT
  p.category AS 品类,
  SUM(oi.qty) AS 销量,
  ROUND(AVG(oi.unit_price_cents) / 100.0, 2) AS 均价
FROM order_items AS oi
JOIN products AS p ON p.id = oi.product_id
GROUP BY p.category
ORDER BY 销量 DESC;`,
}

function commented(title: string, sql: string): string {
  return `-- ${title}\n${sql.trim()}\n`
}

export const MULTI_SQL = [
  commented('各地区金额', SQL.regions),
  commented('订单状态分布', SQL.status),
  commented('各品类销量', SQL.category),
].join('\n')

export type SeedTab = { title: string; sql: string }

export const INITIAL_TABS: SeedTab[] = [
  { title: '客户总览', sql: SQL.customers },
  { title: '各地区订单金额', sql: SQL.regions },
  { title: '近九十天的高价值订单', sql: SQL.highValue },
  { title: '缺少邮箱的活跃客户', sql: SQL.missingEmail },
  { title: '订单状态分布', sql: SQL.status },
  { title: '各品类销量与均价', sql: SQL.category },
  { title: '区域、状态与品类汇总', sql: MULTI_SQL },
]

export const SAMPLE_CONNECTION_ID = 'sample-retail'
export const SAMPLE_CONNECTION_NAME = '示例业务库'

export function draftLocalAnswer(prompt: string): string {
  const text = prompt.trim()
  let lead = '先看客户名单，确认区域和状态。'
  let sql = SQL.customers

  if (/邮箱|email/i.test(text)) {
    lead = '筛选状态为活跃、且没有邮箱的客户。'
    sql = SQL.missingEmail
  } else if (/90|九十|高价值|金额最高/.test(text)) {
    lead = '按金额查看近 90 天的大额订单。'
    sql = SQL.highValue
  } else if (/品类|商品|销量/.test(text)) {
    lead = '按品类汇总销量与均价。'
    sql = SQL.category
  } else if (/状态/.test(text)) {
    lead = '统计每种订单状态的数量。'
    sql = SQL.status
  } else if (/区域|地区|金额|销售/.test(text)) {
    lead = '按区域汇总订单数和金额。'
    sql = SQL.regions
  }

  return `${lead}\n\n\`\`\`sql\n${sql.trim()}\n\`\`\``
}

export const ASSISTANT_PROMPTS = ['华东的活跃客户', '近 90 天金额最高的订单', '各品类销量']
