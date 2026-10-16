/// <reference types="vite/client" />

import type { DesktopApi } from '@shared/contract'

declare global {
  interface Window {
    dataai?: DesktopApi
  }
}

export {}

declare module 'monaco-editor/languages/definitions/sql/sql' {
  export const conf: unknown
  export const language: unknown
}

declare module 'monaco-editor/editor/editor.worker?worker' {
  const WorkerFactory: new () => Worker
  export default WorkerFactory
}
