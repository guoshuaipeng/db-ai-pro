/** Built-in quick SQL templates (not a marketplace). */

export type QueryTemplate = {
  id: string
  title: string
  subtitle: string
  keywords: string
  sql: string
}

export const QUERY_TEMPLATES: QueryTemplate[] = [
  {
    id: 'selectTop',
    title: 'SELECT 前 N 行',
    subtitle: 'SELECT * FROM … LIMIT',
    keywords: 'select top limit 查询',
    sql: 'SELECT *\nFROM {{table}}\nLIMIT {{limit}};',
  },
  {
    id: 'selectCount',
    title: 'COUNT(*)',
    subtitle: '统计表行数',
    keywords: 'count 统计 行数',
    sql: 'SELECT COUNT(*) AS cnt\nFROM {{table}};',
  },
  {
    id: 'selectWhere',
    title: 'SELECT + WHERE',
    subtitle: '带条件的查询骨架',
    keywords: 'where filter 条件',
    sql: "SELECT *\nFROM {{table}}\nWHERE {{column}} = {{value}}\nLIMIT {{limit}};",
  },
  {
    id: 'describeSqlite',
    title: '表结构 · SQLite',
    subtitle: 'PRAGMA table_info',
    keywords: 'describe pragma sqlite 结构',
    sql: 'PRAGMA table_info({{table}});',
  },
  {
    id: 'describeMysql',
    title: '表结构 · MySQL',
    subtitle: 'SHOW COLUMNS / SHOW CREATE',
    keywords: 'describe show columns mysql 结构',
    sql: 'SHOW COLUMNS FROM {{table}};\n-- SHOW CREATE TABLE {{table}};',
  },
  {
    id: 'describePg',
    title: '表结构 · PostgreSQL',
    subtitle: 'information_schema.columns',
    keywords: 'describe postgres postgresql 结构',
    sql:
      "SELECT column_name, data_type, is_nullable\n" +
      "FROM information_schema.columns\n" +
      "WHERE table_name = '{{table}}'\n" +
      'ORDER BY ordinal_position;',
  },
  {
    id: 'insertStub',
    title: 'INSERT 骨架',
    subtitle: '插入一行占位',
    keywords: 'insert 插入',
    sql: 'INSERT INTO {{table}} ({{columns}})\nVALUES ({{values}});',
  },
  {
    id: 'updateStub',
    title: 'UPDATE 骨架',
    subtitle: '按条件更新',
    keywords: 'update 更新',
    sql: 'UPDATE {{table}}\nSET {{column}} = {{value}}\nWHERE id = {{id}};',
  },
  {
    id: 'deleteStub',
    title: 'DELETE 骨架',
    subtitle: '按条件删除（慎用）',
    keywords: 'delete 删除',
    sql: 'DELETE FROM {{table}}\nWHERE id = {{id}};',
  },
]

export const QUERY_TEMPLATE_COMMAND_PREFIX = 'query.tpl.'

export function templateCommandId(id: string): string {
  return `${QUERY_TEMPLATE_COMMAND_PREFIX}${id}`
}

export function templateIdFromCommand(commandId: string): string | null {
  if (!commandId.startsWith(QUERY_TEMPLATE_COMMAND_PREFIX)) return null
  return commandId.slice(QUERY_TEMPLATE_COMMAND_PREFIX.length) || null
}

export function getQueryTemplate(id: string): QueryTemplate | undefined {
  return QUERY_TEMPLATES.find((row) => row.id === id)
}
