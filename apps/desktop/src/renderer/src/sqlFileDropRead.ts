import { isLikelySqlFileName } from '@shared/sqlFileDrop'

export type DroppedSqlFile = { name: string; content: string }

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsText(file)
  })
}

/** Read dropped OS files that look like SQL/text. */
export async function readDroppedSqlFiles(fileList: FileList | File[]): Promise<DroppedSqlFile[]> {
  const files = Array.from(fileList).filter((file) => isLikelySqlFileName(file.name))
  const out: DroppedSqlFile[] = []
  for (const file of files) {
    const content = await readFileAsText(file)
    out.push({ name: file.name, content })
  }
  return out
}
