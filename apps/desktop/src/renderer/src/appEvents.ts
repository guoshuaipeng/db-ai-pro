export type DataaiEventMap = {
  'dataai:open-favorites': undefined
  'dataai:open-history': undefined
  'dataai:open-ai-settings': undefined
  'dataai:focus-tree-search': undefined
  'dataai:focus-editor': undefined
  'dataai:format-sql': undefined
  'dataai:find': undefined
  'dataai:replace': undefined
}

export function emitDataai<K extends keyof DataaiEventMap>(name: K): void {
  window.dispatchEvent(new CustomEvent(name))
}

export function onDataai<K extends keyof DataaiEventMap>(name: K, handler: () => void): () => void {
  const listener = () => handler()
  window.addEventListener(name, listener)
  return () => window.removeEventListener(name, listener)
}
