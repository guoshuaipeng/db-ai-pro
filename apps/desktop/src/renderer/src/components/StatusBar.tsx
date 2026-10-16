import { dialectInfo } from '@shared/types'
import { statusHealthView } from '@shared/statusBar'
import type { ConnHealth } from '@shared/connHealth'
import type { ConnectionPublic } from '@shared/types'

type StatusBarProps = {
  activeConnection: ConnectionPublic | null | undefined
  schemaError: boolean
  health: ConnHealth | undefined
  cursorLine: number
  cursorColumn: number
  readOnlyActive: boolean
  globalReadOnly: boolean
  txnOpen: boolean
  running: boolean
  lastRunLabel: string | null
  lastRunOk: boolean | null
  lastRunSlow: boolean
  encryptionLabel: string | null
  modeLabel: string
  zoomLabel: string
  version: string
  onProbeHealth: () => void
  onOpenPalette: () => void
  onOpenShortcuts: () => void
  onZoomReset: () => void
}

export function StatusBar({
  activeConnection,
  schemaError,
  health,
  cursorLine,
  cursorColumn,
  readOnlyActive,
  globalReadOnly,
  txnOpen,
  running,
  lastRunLabel,
  lastRunOk,
  lastRunSlow,
  encryptionLabel,
  modeLabel,
  zoomLabel,
  version,
  onProbeHealth,
  onOpenPalette,
  onOpenShortcuts,
  onZoomReset,
}: StatusBarProps) {
  const healthView = statusHealthView(health)

  return (
    <footer className="statusbar">
      {activeConnection ? (
        <button
          type="button"
          className="status-item status-btn"
          title={healthView.title}
          onClick={onProbeHealth}
        >
          <span
            className={
              schemaError
                ? 'status-dot is-bad'
                : healthView.tone === 'bad'
                  ? 'status-dot is-bad'
                  : healthView.tone === 'warn'
                    ? 'status-dot is-warn'
                    : healthView.tone === 'good'
                      ? 'status-dot is-on'
                      : 'status-dot'
            }
          />
          <span
            className={`badge badge-${activeConnection.dialect}${
              dialectInfo(activeConnection.dialect).executable || dialectInfo(activeConnection.dialect).kv
                ? ''
                : ' badge-pending'
            }`}
          >
            {dialectInfo(activeConnection.dialect).label}
          </span>
          <span className="status-conn-name">{activeConnection.name}</span>
          <span className={`status-latency is-${healthView.tone}`}>{healthView.text}</span>
        </button>
      ) : (
        <span className="status-item">
          <span className="status-dot" />
          未连接
        </span>
      )}
      <span className="status-item">
        行 {cursorLine} · 列 {cursorColumn}
      </span>
      {readOnlyActive ? (
        <span
          className="status-item is-readonly"
          aria-live="polite"
          title={globalReadOnly ? '全局只读已开启' : '当前连接为只读'}
        >
          只读
        </span>
      ) : null}
      {txnOpen ? (
        <span className="status-item is-txn" aria-live="polite" title="当前连接处于手动事务中">
          事务中
        </span>
      ) : null}
      {running ? (
        <span className="status-item is-running" aria-live="polite">
          <span className="status-pulse" />
          执行中…
        </span>
      ) : lastRunLabel ? (
        <span
          className={
            lastRunOk === false ? 'status-item is-warn' : lastRunSlow ? 'status-item is-slow' : 'status-item'
          }
        >
          {lastRunLabel}
        </span>
      ) : null}
      <span className="status-spacer" />
      {encryptionLabel && <span className="status-item status-muted">{encryptionLabel}</span>}
      <span className="status-item">{modeLabel}</span>
      <button
        type="button"
        className="status-item status-muted status-zoom status-btn"
        title="重置缩放到 100%（Ctrl+0）"
        onClick={onZoomReset}
      >
        {zoomLabel}
      </button>
      <button
        type="button"
        className="status-item status-muted status-btn"
        title="打开命令面板（Ctrl+K）"
        onClick={onOpenPalette}
      >
        Ctrl+K
      </button>
      <button
        type="button"
        className="status-item status-muted status-btn"
        title="键盘快捷键（F1）"
        onClick={onOpenShortcuts}
      >
        F1
      </button>
      <span className="status-item">{version}</span>
    </footer>
  )
}