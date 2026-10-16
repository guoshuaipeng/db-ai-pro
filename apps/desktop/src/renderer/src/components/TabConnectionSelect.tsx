import { useMemo } from 'react'
import { dialectInfo } from '@shared/types'
import {
  resolveTabConnectionId,
  sqlEditorConnections,
  tabConnectionOptionLabel,
} from '@shared/tabConnection'
import { useWorkspace } from '../state/workspace'

/** Toolbar control: bind the active query tab to a SQL-capable connection. */
export function TabConnectionSelect() {
  const ws = useWorkspace()
  const options = useMemo(() => sqlEditorConnections(ws.connections), [ws.connections])
  const value = resolveTabConnectionId(ws.activeEditor, ws.activeConnection?.id) ?? ''
  const disconnected = ws.activeEditor ? ws.tabDisconnected(ws.activeEditor) : false

  if (!ws.activeEditor) return null

  return (
    <label className="tab-conn-select" title="当前查询标签绑定的连接">
      <span className="tab-conn-select-label">连接</span>
      <select
        className={disconnected ? 'tab-conn-select-input is-warn' : 'tab-conn-select-input'}
        value={value}
        aria-label="当前标签连接"
        disabled={ws.running || options.length === 0}
        onChange={(event) => {
          const next = event.target.value
          ws.setActiveTabConnection(next ? next : null)
        }}
      >
        {options.length === 0 && !value ? (
          <option value="">无可用连接</option>
        ) : (
          <>
            {value && !options.some((row) => row.id === value) && (
              <option value={value}>
                {disconnected ? '已断开 · ' : ''}
                {ws.connections.find((c) => c.id === value)?.name ?? value}
              </option>
            )}
            {options.map((row) => (
              <option key={row.id} value={row.id}>
                {tabConnectionOptionLabel(row)}
              </option>
            ))}
          </>
        )}
      </select>
      {value && (
        <span className={`tab-conn-dialect badge badge-${ws.connections.find((c) => c.id === value)?.dialect ?? 'sqlite'}`}>
          {dialectInfo(ws.connections.find((c) => c.id === value)?.dialect ?? 'sqlite').label}
        </span>
      )}
    </label>
  )
}