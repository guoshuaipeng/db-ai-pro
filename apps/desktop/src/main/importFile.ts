import { basename, extname } from 'node:path'
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { parseCsv } from '@shared/csvParse'
import type { ImportSheetData } from '@shared/importPlan'

const MAX_ROWS = 10_000

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('text' in value && typeof (value as { text?: string }).text === 'string') return (value as { text: string }).text
    if ('result' in value) return cellToString((value as { result: ExcelJS.CellValue }).result)
    if ('richText' in value) {
      const parts = (value as { richText: Array<{ text: string }> }).richText
      return parts.map((part) => part.text).join('')
    }
  }
  return String(value)
}

export async function readImportFile(filePath: string): Promise<ImportSheetData> {
  const ext = extname(filePath).toLowerCase()
  const fileName = basename(filePath)
  if (ext === '.csv' || ext === '.txt') {
    const text = readFileSync(filePath, 'utf8')
    const parsed = parseCsv(text)
    if (!parsed.headers.length) throw new Error('CSV 没有表头')
    return {
      headers: parsed.headers,
      rows: parsed.rows.slice(0, MAX_ROWS),
      format: 'csv',
      fileName,
    }
  }
  if (ext === '.xlsx' || ext === '.xls') {
    const book = new ExcelJS.Workbook()
    await book.xlsx.readFile(filePath)
    const sheet = book.worksheets[0]
    if (!sheet) throw new Error('工作簿里没有工作表')
    const matrix: string[][] = []
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as Array<ExcelJS.CellValue | undefined>
      // exceljs rows are 1-indexed; values[0] is unused
      const cells = values.slice(1).map((value) => cellToString(value ?? null))
      matrix.push(cells)
    })
    if (!matrix.length) throw new Error('工作表是空的')
    const headerCells = matrix[0].map((cell, index) => cell.trim() || `column_${index + 1}`)
    const seen = new Map<string, number>()
    const headers = headerCells.map((header) => {
      const count = seen.get(header) ?? 0
      seen.set(header, count + 1)
      return count === 0 ? header : `${header}_${count + 1}`
    })
    const rows: Record<string, string>[] = []
    for (const line of matrix.slice(1, MAX_ROWS + 1)) {
      if (line.every((cell) => cell.trim() === '')) continue
      const row: Record<string, string> = {}
      headers.forEach((header, index) => {
        row[header] = line[index] ?? ''
      })
      rows.push(row)
    }
    return { headers, rows, format: 'xlsx', fileName }
  }
  throw new Error('仅支持 CSV / TXT / XLSX')
}
