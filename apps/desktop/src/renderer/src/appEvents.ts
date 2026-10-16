export type DataaiEventMap = {
  'dataai:open-favorites': undefined
  'dataai:save-favorite': undefined
  'dataai:open-history': undefined
  'dataai:open-history-slow': undefined
  'dataai:open-ai-settings': undefined
  'dataai:focus-tree-search': undefined
  /** Scroll/select a connection row in the object tree. */
  'dataai:reveal-connection': { connectionId: string }
  'dataai:focus-editor': undefined
  'dataai:focus-result': undefined
  'dataai:format-sql': undefined
  'dataai:request-run': undefined
  /** SqlEditor responds with selected-or-full SQL for Run. */
  'dataai:peek-run-sql': {
    respond: (result: { sql: string; fromSelection: boolean }) => void
  }
  'dataai:fill-query-params': undefined
  'dataai:toggle-comment': undefined
  'dataai:find': undefined
  'dataai:open-goto-line': undefined
  'dataai:goto-line': { line: number; column: number }
  'dataai:result-find': undefined
  'dataai:result-autofit-columns': undefined
  'dataai:result-copy-headers': undefined
  'dataai:result-copy-message': undefined
  'dataai:result-copy-markdown': undefined
  'dataai:result-column-visibility': undefined
  'dataai:result-cell-preview': undefined
  'dataai:replace': undefined
  'dataai:open-templates': undefined
  'dataai:insert-template': { templateId: string }
  'dataai:insert-at-cursor': { text: string }
}

export function emitDataai<K extends keyof DataaiEventMap>(
  name: K,
  ...args: DataaiEventMap[K] extends undefined ? [] : [DataaiEventMap[K]]
): void {
  const detail = (args as unknown[])[0]
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

export function onDataai<K extends keyof DataaiEventMap>(
  name: K,
  handler: DataaiEventMap[K] extends undefined ? () => void : (detail: DataaiEventMap[K]) => void,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<DataaiEventMap[K]>).detail
    ;(handler as (detail: DataaiEventMap[K]) => void)(detail)
  }
  window.addEventListener(name, listener)
  return () => window.removeEventListener(name, listener)
}
