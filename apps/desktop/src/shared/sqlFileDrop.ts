/** Detect OS file drags meant for opening SQL tabs (M87). */

export function dragTypeList(
  types: readonly string[] | { [index: number]: string; length: number },
): string[] {
  return Array.from(types as ArrayLike<string>)
}

export function isOsFileDrag(
  types: readonly string[] | { [index: number]: string; length: number },
): boolean {
  return dragTypeList(types).includes('Files')
}

/** Accept .sql / .txt drops from Explorer (not binary dumps). */
export function isLikelySqlFileName(name: string): boolean {
  return /\.(sql|txt)$/i.test(name.trim())
}

export function filterSqlDropFileNames(names: readonly string[]): string[] {
  return names.filter((name) => isLikelySqlFileName(name))
}
