import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '@shared/contract'
import type { AiEvent, AiSettingsInput, ConnectionInput, WorkspaceState } from '@shared/types'

const api: DesktopApi = {
  meta: () => ipcRenderer.invoke('meta:get'),
  connections: {
    list: () => ipcRenderer.invoke('connections:list'),
    save: async (input: ConnectionInput) => {
      const result = await ipcRenderer.invoke('connections:save', input)
      if (result?.error) throw new Error(result.error)
      return result.connection
    },
    remove: (id: string) => ipcRenderer.invoke('connections:remove', id),
    schema: async (id: string) => {
      const result = await ipcRenderer.invoke('connections:schema', id)
      if (result?.error) throw new Error(result.error)
      return result.schema
    },
    test: (input: ConnectionInput) => ipcRenderer.invoke('connections:test', input),
    seedSample: async () => {
      const result = await ipcRenderer.invoke('connections:seedSample')
      if (result?.error) throw new Error(result.error)
      return result.connection
    },
    pickFile: (mode) => ipcRenderer.invoke('connections:pickFile', mode),
  },
  sql: {
    execute: async (payload) => {
      const result = await ipcRenderer.invoke('sql:execute', payload)
      if (result?.error) throw new Error(result.error)
      return result.results
    },
  },
  ai: {
    getSettings: () => ipcRenderer.invoke('ai:getSettings'),
    saveSettings: async (input: AiSettingsInput) => {
      const result = await ipcRenderer.invoke('ai:saveSettings', input)
      if (result?.error) throw new Error(result.error)
      return result.settings
    },
    start: (payload) => ipcRenderer.invoke('ai:start', payload),
    cancel: (requestId: string) => ipcRenderer.invoke('ai:cancel', requestId),
    onEvent: (listener) => {
      const channel = (_event: unknown, data: AiEvent) => listener(data)
      ipcRenderer.on('ai:event', channel)
      return () => ipcRenderer.removeListener('ai:event', channel)
    },
  },
  workspace: {
    load: () => ipcRenderer.invoke('workspace:load'),
    save: (state: WorkspaceState) => ipcRenderer.invoke('workspace:save', state),
  },
}

contextBridge.exposeInMainWorld('dataai', api)
