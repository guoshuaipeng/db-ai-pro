import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '@shared/contract'
import type { AiEvent, AiSettingsInput, ConnectionInput, WorkspaceState } from '@shared/types'
import type { ImportPlanItem } from '@shared/connectionTransfer'

const api: DesktopApi = {
  meta: () => ipcRenderer.invoke('meta:get'),
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    setAlwaysOnTop: (value) => ipcRenderer.invoke('window:setAlwaysOnTop', value),
    isAlwaysOnTop: () => ipcRenderer.invoke('window:isAlwaysOnTop'),
    setZoomFactor: (factor) => ipcRenderer.invoke('window:setZoomFactor', factor),
    getZoomFactor: () => ipcRenderer.invoke('window:getZoomFactor'),
  },
  prefs: {
    get: () => ipcRenderer.invoke('prefs:get'),
    save: (input) => ipcRenderer.invoke('prefs:save', input),
  },
  recent: {
    list: () => ipcRenderer.invoke('recent:list'),
    recordTable: (input) => ipcRenderer.invoke('recent:recordTable', input),
    recordQuery: (input) => ipcRenderer.invoke('recent:recordQuery', input),
    clear: () => ipcRenderer.invoke('recent:clear'),
  },
  app: {
    openUserData: () => ipcRenderer.invoke('app:openUserData'),
    openLogs: () => ipcRenderer.invoke('app:openLogs'),
  },
  connections: {
    list: () => ipcRenderer.invoke('connections:list'),
    listGroups: () => ipcRenderer.invoke('connections:listGroups'),
    saveGroup: async (input) => {
      const result = await ipcRenderer.invoke('connections:saveGroup', input)
      if (result?.error) throw new Error(result.error)
      return result.group ?? result
    },
    removeGroup: (id) => ipcRenderer.invoke('connections:removeGroup', id),
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
    health: (id: string) => ipcRenderer.invoke('connections:health', id),
    seedSample: async () => {
      const result = await ipcRenderer.invoke('connections:seedSample')
      if (result?.error) throw new Error(result.error)
      return result.connection
    },
    pickFile: (mode) => ipcRenderer.invoke('connections:pickFile', mode),
    exportBundle: () => ipcRenderer.invoke('connections:export'),
    importPreview: () => ipcRenderer.invoke('connections:importPreview'),
    importApply: async (plan: ImportPlanItem[]) => {
      const result = await ipcRenderer.invoke('connections:importApply', plan)
      if (result?.error) throw new Error(result.error)
      return result
    },
  },
  sql: {
    execute: async (payload) => {
      const result = await ipcRenderer.invoke('sql:execute', payload)
      if (result?.error) throw new Error(result.error)
      return result.results
    },
    explain: async (payload) => {
      const result = await ipcRenderer.invoke('sql:explain', payload)
      if (result?.error) throw new Error(result.error)
      return result.results
    },
    cancel: (requestId: string) => ipcRenderer.invoke('sql:cancel', requestId),
    txnStatus: (connectionId: string) => ipcRenderer.invoke('sql:txnStatus', connectionId),
    beginTxn: async (connectionId: string) => {
      const result = await ipcRenderer.invoke('sql:beginTxn', connectionId)
      if (result?.error) throw new Error(result.error)
      return result.status
    },
    commitTxn: async (connectionId: string) => {
      const result = await ipcRenderer.invoke('sql:commitTxn', connectionId)
      if (result?.error) throw new Error(result.error)
      return result.status
    },
    rollbackTxn: async (connectionId: string) => {
      const result = await ipcRenderer.invoke('sql:rollbackTxn', connectionId)
      if (result?.error) throw new Error(result.error)
      return result.status
    },
    tableStructure: async (payload) => {
      const result = await ipcRenderer.invoke('sql:tableStructure', payload)
      if (result?.error) throw new Error(result.error)
      return result.structure
    },
    importPick: () => ipcRenderer.invoke('sql:importPick'),
    importRead: async (filePath: string) => {
      const result = await ipcRenderer.invoke('sql:importRead', filePath)
      if (result?.error) throw new Error(result.error)
      return result.data
    },
    updateSqliteCell: async (payload) => {
      const result = await ipcRenderer.invoke('sql:updateSqliteCell', payload)
      if (result?.error) throw new Error(result.error)
      return result.results
    },
  },
  history: {
    list: (connectionId: string) => ipcRenderer.invoke('history:list', connectionId),
    clear: (connectionId: string) => ipcRenderer.invoke('history:clear', connectionId),
    remove: (connectionId: string, entryId: string) =>
      ipcRenderer.invoke('history:remove', { connectionId, entryId }),
  },
  favorites: {
    list: () => ipcRenderer.invoke('favorites:list'),
    save: async (input) => {
      const result = await ipcRenderer.invoke('favorites:save', input)
      if (result?.error) throw new Error(result.error)
      return result.favorite
    },
    remove: (id: string) => ipcRenderer.invoke('favorites:remove', id),
    listFolders: () => ipcRenderer.invoke('favorites:listFolders'),
    saveFolder: async (input) => {
      const result = await ipcRenderer.invoke('favorites:saveFolder', input)
      if (result?.error) throw new Error(result.error)
      return result.folder
    },
    removeFolder: (id: string) => ipcRenderer.invoke('favorites:removeFolder', id),
  },
  redis: {
    scan: async (payload) => {
      const result = await ipcRenderer.invoke('redis:scan', payload)
      if (result?.error) throw new Error(result.error)
      return result.keys
    },
    get: async (payload) => {
      const result = await ipcRenderer.invoke('redis:get', payload)
      if (result?.error) throw new Error(result.error)
      return result.value
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
    repair: (payload) => ipcRenderer.invoke('ai:repair', payload),
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
