import { useEffect, useState } from 'react'
import { dialectInfo } from '@shared/types'
import { formatElapsedMs } from '@shared/slowQuery'
import {
  statusBarConnectionTitle,
  statusBarCopyEndpointHint,
  statusBarDisconnectedLabel,
  statusBarDisconnectedTitle,
  statusBarEndpointSummary,
  statusHealthView,
} from '@shared/statusBar'
import { statusBarRerunTitle } from '@shared/statusBarRerun'
import { editorSelectionStatusTitle } from '@shared/editorSelection'
import { statusBarWordWrapLabel, statusBarWordWrapTitle } from '@shared/statusBarWordWrap'
import { statusBarMinimapLabel, statusBarMinimapTitle } from '@shared/statusBarMinimap'
import { statusBarReadOnlyLabel, statusBarReadOnlyTitle } from '@shared/statusBarReadOnly'
import type { ConnHealth } from '@shared/connHealth'
import type { ConnectionPublic } from '@shared/types'

type StatusBarProps = {
  activeConnection: ConnectionPublic | null | undefined
  schemaError: boolean
  health: ConnHealth | undefined
  cursorLine: number
  cursorColumn: number
  /** e.g. 「3 条语句」 when editor has 2+ statements. */
  statementCountLabel?: string | null
  statementCountTitle?: string
  /** e.g. 「已选 12 字符」 when editor has a selection. */
  selectionLabel?: string | null
  readOnlyActive: boolean
  globalReadOnly: boolean
  connectionReadOnly?: boolean
  txnOpen: boolean
  running: boolean
  runningSince: number | null
  lastRunLabel: string | null
  lastRunOk: boolean | null
  lastRunSlow: boolean
  encryptionLabel: string | null
  modeLabel: string
  zoomLabel: string
  wordWrap: boolean
  minimap: boolean
  version: string
  onProbeHealth: () => void
  onRevealConnection: () => void
  onCopyEndpoint: () => void
  onOpenCreateConnection: () => void
  onOpenPalette: () => void
  onOpenShortcuts: () => void
  onOpenGotoLine: () => void
  onRerunLast: () => void
  lastRunKind?: 'run' | 'explain' | null
  onZoomReset: () => void
  onToggleWordWrap: () => void
  onToggleMinimap: () => void
  onToggleGlobalReadOnly: () => void
}

export function StatusBar({
  activeConnection,
  schemaError,
  health,
  cursorLine,
  cursorColumn,
  statementCountLabel,
  statementCountTitle,
  selectionLabel,
  readOnlyActive,
  globalReadOnly,
  connectionReadOnly = false,
  txnOpen,
  running,
  runningSince,
  lastRunLabel,
  lastRunOk,
  lastRunSlow,
  encryptionLabel,
  modeLabel,
  zoomLabel,
  wordWrap,
  minimap,
  version,
  onProbeHealth,
  onRevealConnection,
  onCopyEndpoint,
  onOpenCreateConnection,
  onOpenPalette,
  onOpenShortcuts,
  onOpenGotoLine,
  onRerunLast,
  lastRunKind,
  onZoomReset,
  onToggleWordWrap,
  onToggleMinimap,
  onToggleGlobalReadOnly,
}: StatusBarProps) {
  const healthView = statusHealthView(health)
  const endpointSummary = activeConnection ? statusBarEndpointSummary(activeConnection) : ''

  return (
    <footer className="statusbar">
      {activeConnection ? (
        <div className="status-conn">
          <button
            type="button"
            className="status-item status-btn status-conn-main"
            title={statusBarConnectionTitle(healthView.title, endpointSummary)}
            onClick={(event) => {
              if (event.altKey) {
                event.preventDefault()
                onCopyEndpoint()
                return
              }
              if (event.ctrlKey || event.metaKey) {
                event.preventDefault()
                onRevealConnection()
                return
              }
              onProbeHealth()
            }}
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
            {endpointSummary ? (
              <span className="status-conn-endpoint" title={endpointSummary}>
                {endpointSummary}
              </span>
            ) : null}
            <span className={`status-latency is-${healthView.tone}`}>{healthView.text}</span>
          </button>
          <button
            type="button"
            className="status-item status-btn status-conn-copy"
            title={statusBarCopyEndpointHint()}
            aria-label={statusBarCopyEndpointHint()}
            onClick={onCopyEndpoint}
          >
            复制地址
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="status-item status-btn status-disconnected"
          title={statusBarDisconnectedTitle()}
          onClick={onOpenCreateConnection}
        >
          <span className="status-dot" />
          {statusBarDisconnectedLabel()}
          <span className="status-disconnected-hint">新建连接</span>
        </button>
      )}
      <button
        type="button"
        className="status-item status-btn"
        title="转到行（Ctrl+G）"
        onClick={onOpenGotoLine}
      >
        行 {cursorLine} · 列 {cursorColumn}
      </button>
      {statementCountLabel ? (
        <span
          className="status-item status-muted"
          title={statementCountTitle || statementCountLabel}
          aria-label={statementCountTitle || statementCountLabel}
        >
          {statementCountLabel}
        </span>
      ) : null}
      {selectionLabel ? (
        <span
          className="status-item status-muted"
          title={editorSelectionStatusTitle()}
          aria-label={selectionLabel}
        >
          {selectionLabel}
        </span>
      ) : null}
      <button
        type="button"
        className={
          readOnlyActive
            ? 'status-item status-btn is-readonly'
            : 'status-item status-muted status-btn'
        }
        title={statusBarReadOnlyTitle({
          readOnlyActive,
          globalReadOnly,
          connectionReadOnly,
        })}
        aria-pressed={globalReadOnly}
        aria-label={statusBarReadOnlyLabel(readOnlyActive)}
        onClick={onToggleGlobalReadOnly}
      >
        {statusBarReadOnlyLabel(readOnlyActive)}
      </button>
      {txnOpen ? (
        <span className="status-item is-txn" aria-live="polite" title="当前连接处于手动事务中">
          事务中
        </span>
      ) : null}
      {running ? (
        <RunningElapsed since={runningSince} />
      ) : lastRunLabel ? (
        <button
          type="button"
          className={
            lastRunOk === false
              ? 'status-item status-btn is-warn'
              : lastRunSlow
                ? 'status-item status-btn is-slow'
                : 'status-item status-btn'
          }
          title={statusBarRerunTitle(lastRunKind)}
          onClick={onRerunLast}
        >
          {lastRunLabel}
        </button>
      ) : null}
      <span className="status-spacer" />
      {encryptionLabel && <span className="status-item status-muted">{encryptionLabel}</span>}
      <span className="status-item">{modeLabel}</span>
      <button
        type="button"
        className={
          minimap
            ? 'status-item status-btn is-minimap-on'
            : 'status-item status-muted status-btn'
        }
        title={statusBarMinimapTitle(minimap)}
        aria-pressed={minimap}
        onClick={onToggleMinimap}
      >
        {statusBarMinimapLabel(minimap)}
      </button>
      <button
        type="button"
        className={
          wordWrap
            ? 'status-item status-btn is-wrap-on'
            : 'status-item status-muted status-btn'
        }
        title={statusBarWordWrapTitle(wordWrap)}
        aria-pressed={wordWrap}
        onClick={onToggleWordWrap}
      >
        {statusBarWordWrapLabel(wordWrap)}
      </button>
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

function RunningElapsed({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [])
  const elapsed = since != null ? Math.max(0, now - since) : 0
  return (
    <span className="status-item is-running" aria-live="polite" title="查询执行中">
      <span className="status-pulse" />
      执行中 · {formatElapsedMs(elapsed)}
    </span>
  )
}
