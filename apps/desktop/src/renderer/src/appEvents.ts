export type DataaiEventMap = {
  'dataai:open-favorites': undefined
  'dataai:open-history': undefined
  'dataai:open-ai-settings': undefined
  'dataai:focus-tree-search': undefined
  'dataai:focus-editor': undefined
  'dataai:format-sql': undefined
  'dataai:toggle-comment': undefined
  'dataai:find': undefined
  'dataai:result-find': undefined
  'dataai:result-autofit-columns': undefined
  'dataai:result-column-visibility': undefined
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
