import type { DesktopApi } from '@shared/contract'
import { createPreviewApi } from './previewApi'

let preview: DesktopApi | null = null

export function getApi(): DesktopApi {
  if (window.dataai) return window.dataai
  preview ??= createPreviewApi()
  return preview
}
