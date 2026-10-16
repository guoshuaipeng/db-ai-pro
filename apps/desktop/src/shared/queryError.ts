/** Parse / classify SQL error messages for the result pane (M133). */

export type ParsedQueryError = {
  /** Primary headline shown above the detail. */
  title: string
  /** Full message body (normalized newlines). */
  detail: string
  sqlState?: string
  line?: number
  column?: number
  /** Short Chinese hint for next steps. */
  hint: string
}

const ERROR_HINT =
  '可复制错误、转到报错行，或请助手根据报错修复 SQL。检查语法、表名/列名与当前库是否一致。'

/** Whether a result message looks like a failed query / plan. */
export function looksLikeQueryError(message: string | null | undefined): boolean {
  const text = (message ?? '').trim()
  if (!text) return false
  if (/^(ERROR|Error|FATAL|失败|错误)[:：\s]/m.test(text)) return true
  if (/\bSQLSTATE\b|[Ss]yntax error|near ["'`]/.test(text)) return true
  if (/You have an error in your SQL/i.test(text)) return true
  if (/执行失败|查询失败|计划 .+ · .+失败|【\d+】.+失败/.test(text)) return true
  if (/\berror\b/i.test(text) && /sql|syntax|relation|column|table|no such/i.test(text)) return true
  return false
}

export function parseQueryErrorMessage(message: string | null | undefined): ParsedQueryError {
  const detail = (message ?? '').replace(/\r\n/g, '\n').trim() || '未知错误'
  const sqlState = detail.match(/\bSQLSTATE[:=]?\s*([0-9A-Z]{5})\b/i)?.[1]?.toUpperCase()

  let line: number | undefined
  let column: number | undefined
  const lineMatch =
    detail.match(/\bLINE\s+(\d+)\b/i) ||
    detail.match(/\bat\s+line\s+(\d+)\b/i) ||
    detail.match(/第\s*(\d+)\s*行/)
  if (lineMatch) {
    const n = Number(lineMatch[1])
    if (Number.isFinite(n) && n >= 1) line = Math.floor(n)
  }
  const colMatch = detail.match(/\bCOLUMN\s+(\d+)\b/i) || detail.match(/\bat\s+character\s+(\d+)\b/i)
  if (colMatch) {
    const n = Number(colMatch[1])
    if (Number.isFinite(n) && n >= 1) column = Math.floor(n)
  }

  const firstLine = detail.split('\n').map((row) => row.trim()).find(Boolean) || '查询失败'
  let title = firstLine
  if (title.length > 96) title = `${title.slice(0, 95)}…`
  if (/^ERROR:\s*/i.test(title)) title = title.replace(/^ERROR:\s*/i, '错误：')
  else if (/^Error:\s*/i.test(title)) title = title.replace(/^Error:\s*/i, '错误：')
  else if (!/^(错误|失败)/.test(title)) title = `错误：${title}`

  return { title, detail, sqlState, line, column, hint: ERROR_HINT }
}

export function formatQueryErrorClipboard(parsed: ParsedQueryError): string {
  const bits = [parsed.title]
  if (parsed.sqlState) bits.push(`SQLSTATE ${parsed.sqlState}`)
  if (parsed.line != null) {
    bits.push(parsed.column != null ? `行 ${parsed.line} · 列 ${parsed.column}` : `行 ${parsed.line}`)
  }
  bits.push(parsed.detail)
  return bits.join('\n')
}

export function queryErrorCopiedToast(): string {
  return '已复制错误信息'
}

export function queryErrorGotoToast(line: number): string {
  return `已定位到第 ${Math.max(1, Math.floor(line))} 行`
}

export function queryErrorMetaLabel(parsed: ParsedQueryError): string | null {
  const bits: string[] = []
  if (parsed.sqlState) bits.push(`SQLSTATE ${parsed.sqlState}`)
  if (parsed.line != null) {
    bits.push(parsed.column != null ? `行 ${parsed.line} · 列 ${parsed.column}` : `行 ${parsed.line}`)
  }
  return bits.length ? bits.join(' · ') : null
}
