import { useMemo } from 'react'
import { dialectInfo } from '@shared/types'
import {
  resolveTabConnectionId,
  sqlEditorConnections,
  tabConnectionOptionLabel,
} from '@shared/tabConnection'
import {
  tabConnectionAria,
  tabConnectionClearedToast,
  tabConnectionBoundToast,
  tabConnectionDisconnectedHint,
  tabConnectionEmptyBody,
  tabConnectionEmptyTitle,
  tabConnectionFollowActiveLabel,
  tabConnectionKicker,
  tabConnectionLabel,
  tabConnectionMissingOption,
  tabConnectionNoneOption,
  tabConnectionSelectTitle,
  tabConnectionStatusOk,
} from '@shared/tabConnectionUi'
import { useWorkspace } from '../state/workspace'
import { EmptyState } from './EmptyState'

/** Toolbar control: bind the active query tab to a SQL-capable connection. */
export function TabConnectionSelect() {
  const ws = useWorkspace()
  const options = useMemo(() => sqlEditorConnections(ws.connections), [ws.connections])
  const value = resolveTabConnectionId(ws.activeEditor, ws.activeConnection?.id) ?? ''
  const disconnected = ws.activeEditor ? ws.tabDisconnected(ws.activeEditor) : false
  const bound = ws.connections.find((c) => c.id === value) ?? null
  const explicitBind = Boolean(ws.activeEditor?.connectionId?.trim())

  if (!ws.activeEditor) return null

  const onChange = (nextId: string) => {
    if (!nextId) {
      ws.setActiveTabConnection(null)
      ws.pushToast('info', tabConnectionClearedToast())
      return
    }
    ws.setActiveTabConnection(nextId)
    const next = ws.connections.find((c) => c.id === nextId)
    if (next) ws.pushToast('success', tabConnectionBoundToast(next))
  }

  if (options.length === 0 && !value) {
    return (
      <div className="tab-conn-empty" role="status">
        <EmptyState
          compact
          kicker={tabConnectionKicker()}
          title={tabConnectionEmptyTitle()}
          body={tabConnectionEmptyBody()}
        />
      </div>
    )
  }

  return (
    <div className="tab-conn-block">
      <label className="tab-conn-select" title={tabConnectionSelectTitle()}>
        <span className="tab-conn-select-label">{tabConnectionLabel()}</span>
        <select
          className={disconnected ? 'tab-conn-select-input is-warn' : 'tab-conn-select-input'}
          value={value}
          aria-label={tabConnectionAria()}
          disabled={ws.running || options.length === 0}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.length === 0 && !value ? (
            <option value="">{tabConnectionNoneOption()}</option>
          ) : (
            <>
              {value && !options.some((row) => row.id === value) && (
                <option value={value}>
                  {tabConnectionMissingOption(
                    ws.connections.find((c) => c.id === value)?.name ?? value,
                    disconnected,
                  )}
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
        {bound ? (
          <span className={`tab-conn-dialect badge badge-${bound.dialect}`}>
            {dialectInfo(bound.dialect).label}
          </span>
        ) : null}
        {explicitBind ? (
          <button
            type="button"
            className="btn btn-ghost tiny-btn tab-conn-follow"
            disabled={ws.running}
            title={tabConnectionClearedToast()}
            onClick={() => onChange('')}
          >
            {tabConnectionFollowActiveLabel()}
          </button>
        ) : null}
      </label>
      {bound && !disconnected ? (
        <p className="tab-conn-status" role="status">
          {tabConnectionStatusOk(bound.name, dialectInfo(bound.dialect).label)}
        </p>
      ) : null}
      {disconnected && bound ? (
        <p className="tab-conn-status is-warn" role="status">
          {tabConnectionDisconnectedHint(bound.name)}
        </p>
      ) : null}
    </div>
  )
}
