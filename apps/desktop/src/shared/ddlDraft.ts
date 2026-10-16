import { quoteIdent, identStyle } from './sql'
import type { TableSpec } from './schema'

function colType(dialect: string, hint: string): string {
  const h = hint.toLowerCase()
  if (/int|数量|个数|id$/.test(h)) return dialect === 'postgresql' ? 'INTEGER' : 'INTEGER'
  if (/金额|price|amount|cent/.test(h)) return dialect === 'postgresql' ? 'NUMERIC(12,2)' : 'DECIMAL(12,2)'
  if (/时间|日期|at$|_at|date|time/.test(h)) {
    if (dialect === 'postgresql') return 'TIMESTAMPTZ'
    if (dialect === 'mysql' || dialect === 'mariadb') return 'DATETIME'
    return 'TEXT'
  }
  if (/是否|bool|flag/.test(h)) return dialect === 'sqlite' ? 'INTEGER' : 'BOOLEAN'
  return dialect === 'sqlite' ? 'TEXT' : 'VARCHAR(255)'
}

function guessColumns(prompt: string): { name: string; type: string; note: string }[] {
  const cols: { name: string; type: string; note: string }[] = [
    { name: 'id', type: 'INTEGER', note: '主键' },
  ]
  const text = prompt.toLowerCase()
  const candidates: [RegExp, string, string][] = [
    [/名称|名字|name/, 'name', '名称'],
    [/邮箱|email/, 'email', '邮箱'],
    [/手机|电话|phone/, 'phone', '手机'],
    [/区域|地区|region/, 'region', '区域'],
    [/状态|status/, 'status', '状态'],
    [/备注|说明|note|remark/, 'note', '备注'],
    [/创建|created|创建时间/, 'created_at', '创建时间'],
    [/更新|updated/, 'updated_at', '更新时间'],
    [/金额|amount|price/, 'amount', '金额'],
    [/数量|qty|count/, 'qty', '数量'],
    [/标签|tag/, 'tag', '标签'],
    [/分类|品类|category/, 'category', '分类'],
  ]
  for (const [re, name, note] of candidates) {
    if (re.test(text) && !cols.some((c) => c.name === name)) {
      cols.push({ name, type: '', note })
    }
  }
  if (cols.length === 1) {
    cols.push({ name: 'name', type: '', note: '名称' }, { name: 'created_at', type: '', note: '创建时间' })
  }
  return cols.map((c) => ({ ...c, type: c.type || 'AUTO' }))
}

function tableNameFromPrompt(prompt: string): string {
  const m =
    prompt.match(/表[名叫做为：:\s]*([a-zA-Z_][\w]*)/) ||
    prompt.match(/(?:create|建|新建)\s*([a-zA-Z_][\w]*)/i) ||
    prompt.match(/([a-zA-Z_][\w]*)\s*表/)
  if (m?.[1]) return m[1].toLowerCase()
  if (/标签|tag/.test(prompt)) return 'tags'
  if (/客户/.test(prompt)) return 'customer_notes'
  if (/订单/.test(prompt)) return 'order_extras'
  return 'new_table'
}

export function draftCreateTable(options: {
  prompt: string
  dialect: string
  reference?: TableSpec | null
}): string {
  const style = identStyle(options.dialect)
  const name = tableNameFromPrompt(options.prompt)
  const q = (id: string) => quoteIdent(id, style)

  let columns = guessColumns(options.prompt).map((col) => ({
    name: col.name,
    type: col.type === 'AUTO' ? colType(options.dialect, col.name + col.note) : col.type,
    note: col.note,
  }))

  if (options.reference && options.reference.columns.length > 0) {
    const refTypes = options.reference.columns
    columns = columns.map((col) => {
      const hit = refTypes.find((c) => c.name.toLowerCase() === col.name.toLowerCase())
      if (hit?.dataType) return { ...col, type: hit.dataType }
      return col
    })
    const lead = `-- 参考表 ${options.reference.name} 的字段风格\n`
    const body = columns
      .map((col, index) => {
        const pk = index === 0 && col.name === 'id' ? ' PRIMARY KEY' : ''
        return `  ${q(col.name)} ${col.type}${pk}`
      })
      .join(',\n')
    return `${lead}CREATE TABLE ${q(name)} (\n${body}\n);`
  }

  const body = columns
    .map((col, index) => {
      const pk = index === 0 && col.name === 'id' ? ' PRIMARY KEY' : ''
      return `  ${q(col.name)} ${col.type}${pk}`
    })
    .join(',\n')
  return `CREATE TABLE ${q(name)} (\n${body}\n);`
}

export function draftAlterTable(options: {
  prompt: string
  dialect: string
  table: string
  tableSpec?: TableSpec | null
}): string {
  const style = identStyle(options.dialect)
  const q = (id: string) => quoteIdent(id, style)
  const table = options.table || 'target_table'
  const text = options.prompt

  const addMatch = text.match(/(?:加|增加|新增|添加|add)\s*(?:一?个)?\s*([a-zA-Z_\u4e00-\u9fff][\w\u4e00-\u9fff]*)/i)
  const dropMatch = text.match(/(?:删|删除|去掉|drop)\s*(?:一?个)?\s*(?:字段|列)?\s*([a-zA-Z_][\w]*)/i)
  const renameMatch = text.match(/(?:改名|重命名|rename)\s*([a-zA-Z_][\w]*)\s*(?:为|成|to)\s*([a-zA-Z_][\w]*)/i)

  if (dropMatch?.[1]) {
    return `ALTER TABLE ${q(table)} DROP COLUMN ${q(dropMatch[1])};`
  }
  if (renameMatch?.[1] && renameMatch[2]) {
    if (options.dialect === 'sqlite') {
      return `-- SQLite 3.25+ 才支持 RENAME COLUMN\nALTER TABLE ${q(table)} RENAME COLUMN ${q(renameMatch[1])} TO ${q(renameMatch[2])};`
    }
    return `ALTER TABLE ${q(table)} RENAME COLUMN ${q(renameMatch[1])} TO ${q(renameMatch[2])};`
  }

  let colName = 'new_column'
  let note = '新字段'
  if (addMatch?.[1]) {
    const raw = addMatch[1]
    if (/邮箱|email/i.test(raw)) {
      colName = 'email'
      note = '邮箱'
    } else if (/手机|电话|phone/i.test(raw)) {
      colName = 'phone'
      note = '手机'
    } else if (/备注|note/i.test(raw)) {
      colName = 'note'
      note = '备注'
    } else if (/^[a-zA-Z_]/.test(raw)) {
      colName = raw
      note = raw
    } else {
      colName = 'extra_field'
      note = raw
    }
  }

  const type = colType(options.dialect, colName + note)
  if (options.dialect === 'postgresql') {
    return `ALTER TABLE ${q(table)} ADD COLUMN ${q(colName)} ${type};`
  }
  if (options.dialect === 'mysql' || options.dialect === 'mariadb') {
    return `ALTER TABLE ${q(table)} ADD COLUMN ${q(colName)} ${type} NULL;`
  }
  return `ALTER TABLE ${q(table)} ADD COLUMN ${q(colName)} ${type};`
}

export const CREATE_PROMPTS = ['建一个客户标签表，含名称和创建时间', '按客户表风格新建会员积分表', '创建订单备注表']
export const ALTER_PROMPTS = ['给客户表加一个邮箱字段', '给订单表增加备注列', '删除临时字段 temp_flag']
