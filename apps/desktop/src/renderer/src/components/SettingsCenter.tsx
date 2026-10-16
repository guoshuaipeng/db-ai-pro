import { useEffect, useMemo, useState } from 'react'
import {
  EDITOR_FONT_MAX,
  EDITOR_FONT_MIN,
  ZOOM_MAX,
  ZOOM_MIN,
  clampEditorFontSize,
  clampQueryTimeoutSec,
  clampZoomFactor,
  formatZoomPercent,
  stepZoomFactor,
  type AppPrefs,
  type UiAccent,
  type UiDensity,
} from '@shared/prefs'
import {
  SETTINGS_SEARCH_ITEMS,
  settingsSearchEmptyBody,
  settingsSearchMatchCountLabel,
  tabHasSettingsMatch,
  visibleSettingIdsForTab,
  type SettingsTabId,
} from '@shared/settingsSearch'
import { Mark } from './icons'
import { EmptyState } from './EmptyState'
import {
  ACCENT_OPTIONS,
  accentChangedToast,
  appearanceThemeKicker,
  appearanceThemeLead,
  appearanceThemeTitle,
  densityChangedToast,
  densityComfortableBlurb,
  densityComfortableTitle,
  densityCompactBlurb,
  densityCompactTitle,
  densitySectionBody,
  densitySectionTitle,
  highContrastHint,
} from '@shared/appearanceTheme'
import {
  QUERY_TIMEOUT_PRESETS,
  queryTimeoutHint,
  queryTimeoutPolicySummary,
  queryTimeoutPresetLabel,
  queryTimeoutSavedNote,
  validateQueryTimeoutDraft,
} from '@shared/queryRunStatus'
import {
  AI_ENDPOINT_PRESETS,
  aiModelBaseUrlHint,
  aiModelClearKeyLabel,
  aiModelKeyHint,
  aiModelNameHint,
  aiModelReadiness,
  aiModelStatusBody,
  aiModelStatusKicker,
  aiModelStatusLabel,
  matchEndpointPreset,
  modelSuggestionsFor,
  validateAiModelDraft,
} from '@shared/aiModelSettings'
import {
  sessionRestoreDisabledToast,
  sessionRestoreEnabledToast,
  sessionRestoreSettingBody,
  sessionRestoreSettingOffLabel,
  sessionRestoreSettingOnLabel,
  sessionRestoreSettingTitle,
} from '@shared/sessionRestoreUi'
import { useWorkspace } from '../state/workspace'
import { getApi } from '../bridge'
import {
  RELEASE_NOTES_SNIPPET,
  aboutChangelogEmptyBody,
  aboutChannelLabel,
  aboutCopyDiagnosticsLabel,
  aboutCopyVersionLabel,
  aboutDiagnosticsText,
  aboutEncryptionLabel,
  aboutVersionBadge,
  aboutVersionCopyText,
  releaseNotesTitle,
} from '@shared/releaseNotes'

export type SettingsTab = SettingsTabId

type SettingsCenterProps = {
  open: boolean
  tab: SettingsTab
  onTab: (tab: SettingsTab) => void
  onClose: () => void
  prefs: AppPrefs
  onPrefs: (prefs: AppPrefs) => void
}

export function SettingsCenter({ open, tab, onTab, onClose, prefs, onPrefs }: SettingsCenterProps) {
  const ws = useWorkspace()
  const [filterQuery, setFilterQuery] = useState('')

  useEffect(() => {
    if (!open) {
      setFilterQuery('')
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (filterQuery.trim()) {
          event.preventDefault()
          setFilterQuery('')
          return
        }
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose, filterQuery])

  const visibleIds = useMemo(
    () => visibleSettingIdsForTab(tab, filterQuery),
    [tab, filterQuery],
  )
  const tabTotal = useMemo(
    () => SETTINGS_SEARCH_ITEMS.filter((item) => item.tab === tab).length,
    [tab],
  )
  const matchedInTab = visibleIds.size
  const showEmpty = Boolean(filterQuery.trim()) && matchedInTab === 0

  if (!open) return null

  return (
    <div className="overlay settings-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="settings-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <aside className="settings-nav" aria-label="设置分组">
          <p className="settings-nav-kicker">DataAI</p>
          <h2 id="settings-title">设置</h2>
          <nav className="settings-tabs">
            {(
              [
                { id: 'model' as const, label: '模型' },
                { id: 'appearance' as const, label: '外观' },
                { id: 'query' as const, label: '查询' },
                { id: 'about' as const, label: '关于' },
              ] as const
            ).map((item) => {
              const hasMatch = tabHasSettingsMatch(item.id, filterQuery)
              const dimmed = Boolean(filterQuery.trim()) && !hasMatch
              return (
                <button
                  key={item.id}
                  type="button"
                  className={
                    tab === item.id
                      ? 'settings-tab is-active'
                      : dimmed
                        ? 'settings-tab is-dimmed'
                        : 'settings-tab'
                  }
                  onClick={() => onTab(item.id)}
                  title={dimmed ? '当前筛选下此分组无匹配项' : undefined}
                >
                  {item.label}
                  {filterQuery.trim() && hasMatch && tab !== item.id ? (
                    <span className="settings-tab-dot" aria-hidden="true" />
                  ) : null}
                </button>
              )
            })}
          </nav>
        </aside>
        <section className="settings-main">
          <header className="settings-main-head">
            <h3>
              {tab === 'model'
                ? '模型与密钥'
                : tab === 'appearance'
                  ? '外观'
                  : tab === 'query'
                    ? '查询'
                    : '关于 DataAI'}
            </h3>
            <button type="button" className="btn btn-ghost tiny-btn" onClick={onClose}>
              关闭
            </button>
          </header>
          <div className="settings-filter-bar">
            <label className="history-filter settings-filter">
              <span className="history-filter-label">筛选</span>
              <input
                className="history-filter-input"
                value={filterQuery}
                onChange={(event) => setFilterQuery(event.target.value)}
                placeholder="搜索设置项…"
                aria-label="筛选设置项"
                spellCheck={false}
              />
              {filterQuery.trim() ? (
                <span className="history-filter-count">
                  {settingsSearchMatchCountLabel(matchedInTab, tabTotal)}
                </span>
              ) : null}
              {filterQuery.trim() ? (
                <button
                  type="button"
                  className="btn btn-ghost tiny-btn"
                  onClick={() => setFilterQuery('')}
                >
                  清除
                </button>
              ) : null}
            </label>
          </div>
          <div className="settings-body">
            {showEmpty ? (
              <EmptyState
                compact
                kicker="设置"
                title="没有匹配的设置项"
                body={settingsSearchEmptyBody()}
                actions={
                  <button type="button" className="btn btn-ghost" onClick={() => setFilterQuery('')}>
                    清除筛选
                  </button>
                }
              />
            ) : (
              <>
                {tab === 'model' && visibleIds.has('model') && <ModelPanel onClose={onClose} />}
                {tab === 'appearance' && (
                  <AppearancePanel prefs={prefs} onPrefs={onPrefs} visibleIds={visibleIds} />
                )}
                {tab === 'query' && (
                  <QueryPanel prefs={prefs} onPrefs={onPrefs} visibleIds={visibleIds} />
                )}
                {tab === 'about' && visibleIds.has('about') && (
                  <AboutPanel
                    version={ws.meta?.version ?? '2.6.0'}
                    encryption={ws.meta?.encryption}
                    mode={ws.meta?.mode}
                  />
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function ModelPanel({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace()
  const [baseUrl, setBaseUrl] = useState(ws.settings?.baseUrl ?? '')
  const [model, setModel] = useState(ws.settings?.model ?? '')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)

  const draft = {
    baseUrl,
    model,
    apiKeyDraft: apiKey,
    hasKey: Boolean(ws.settings?.hasKey),
  }
  const readiness = aiModelReadiness(draft)
  const activePreset = matchEndpointPreset(baseUrl)
  const modelSuggestions = modelSuggestionsFor(baseUrl)

  const persist = (input: { baseUrl: string; model: string; apiKey?: string }, thenClose: boolean) => {
    setSaving(true)
    setError('')
    void ws
      .saveSettings(input)
      .then(() => {
        setApiKey('')
        setError('')
        if (thenClose) onClose()
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '没有保存'))
      .finally(() => {
        setSaving(false)
        setClearing(false)
      })
  }

  return (
    <form
      className="settings-card"
      onSubmit={(event) => {
        event.preventDefault()
        const problem = validateAiModelDraft(draft)
        if (problem) {
          setError(problem)
          return
        }
        persist({ baseUrl: baseUrl.trim(), model: model.trim(), apiKey: apiKey || undefined }, true)
      }}
    >
      <EmptyState
        compact
        kicker={aiModelStatusKicker(readiness)}
        title={aiModelStatusLabel(readiness)}
        body={aiModelStatusBody(readiness)}
      />
      <p className="settings-lead">配置 OpenAI 兼容接口。密钥使用系统密钥环密封后写入本机，不会以明文落盘。</p>

      <div className="ai-model-presets" role="group" aria-label="常用接口">
        <span className="ai-model-presets-label">常用接口</span>
        <div className="chips">
          {AI_ENDPOINT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={activePreset?.id === preset.id ? 'chip is-active' : 'chip'}
              onClick={() => {
                setBaseUrl(preset.baseUrl)
                if (!model.trim() || (activePreset && activePreset.models.includes(model.trim()))) {
                  setModel(preset.models[0] ?? model)
                }
                setError('')
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>接口地址</span>
        <input
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          spellCheck={false}
          placeholder="https://api.openai.com/v1"
        />
      </label>
      <p className="field-hint">{aiModelBaseUrlHint()}</p>

      <label className="field">
        <span>模型</span>
        <input
          value={model}
          onChange={(event) => setModel(event.target.value)}
          spellCheck={false}
          placeholder="例如 gpt-4o-mini"
        />
      </label>
      <p className="field-hint">{aiModelNameHint()}</p>
      <div className="chips ai-model-suggestions" role="group" aria-label="常用模型">
        {modelSuggestions.map((name) => (
          <button
            key={name}
            type="button"
            className={model.trim() === name ? 'chip is-active' : 'chip'}
            onClick={() => {
              setModel(name)
              setError('')
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <label className="field">
        <span>API Key</span>
        <input
          type="password"
          value={apiKey}
          placeholder={ws.settings?.hasKey ? '已保存，留空则不修改' : '粘贴密钥'}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off"
        />
      </label>
      <p className="field-hint">{aiModelKeyHint(Boolean(ws.settings?.hasKey))}</p>
      <p className="field-hint">
        {ws.meta?.encryption === 'os' ? '加密：系统密钥环（DPAPI / safeStorage）' : '当前系统密钥环不可用，密钥不会写入磁盘。'}
      </p>
      {error && <p className="field-error">{error}</p>}
      <div className="dialog-actions">
        {ws.settings?.hasKey ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={saving || clearing}
            onClick={() => {
              setClearing(true)
              persist({ baseUrl: baseUrl.trim(), model: model.trim(), apiKey: '' }, false)
            }}
          >
            {clearing ? '清除中…' : aiModelClearKeyLabel()}
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving || clearing}>
          {ws.settings?.hasKey ? '关闭' : '取消'}
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || clearing}>
          {saving && !clearing ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  )
}

function QueryPanel({
  prefs,
  onPrefs,
  visibleIds,
}: {
  prefs: AppPrefs
  onPrefs: (prefs: AppPrefs) => void
  visibleIds: Set<string>
}) {
  const api = getApi()
  const [timeoutSec, setTimeoutSec] = useState(String(prefs.queryTimeoutSec))
  const [slowMs, setSlowMs] = useState(String(prefs.slowQueryMs))
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    setTimeoutSec(String(prefs.queryTimeoutSec))
  }, [prefs.queryTimeoutSec])

  useEffect(() => {
    setSlowMs(String(prefs.slowQueryMs))
  }, [prefs.slowQueryMs])

  const ws = useWorkspace()

  const saveSlow = async () => {
    setBusy(true)
    try {
      await ws.setSlowQueryMs(Number(slowMs))
      const next = await api.prefs.get()
      onPrefs(next)
      setSlowMs(String(next.slowQueryMs))
    } finally {
      setBusy(false)
    }
  }

  const saveTimeout = async () => {
    const problem = validateQueryTimeoutDraft(timeoutSec)
    if (problem) {
      setNote(problem)
      return
    }
    setBusy(true)
    setNote('')
    try {
      const next = await api.prefs.save({ queryTimeoutSec: Number(timeoutSec) })
      onPrefs(next)
      setTimeoutSec(String(next.queryTimeoutSec))
      setNote(queryTimeoutSavedNote(next.queryTimeoutSec))
    } finally {
      setBusy(false)
    }
  }

  const showTimeout = visibleIds.has('queryTimeoutSec')
  const showSlow = visibleIds.has('slowQueryMs')

  return (
    <div className="settings-card">
      {showTimeout ? (
        <>
          <EmptyState
            compact
            kicker="查询"
            title="软超时与取消"
            body={queryTimeoutPolicySummary(Number(timeoutSec) || 0)}
          />
          <p className="settings-lead">
            配置查询软超时。执行中可在编辑器工具栏取消或按 Esc；超时后会按驱动能力中断连接上的查询。
          </p>
          <div className="query-timeout-presets" role="group" aria-label="常用软超时">
            <span className="query-timeout-presets-label">常用</span>
            <div className="chips">
              {QUERY_TIMEOUT_PRESETS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className={
                    clampQueryTimeoutSec(Number(timeoutSec)) === sec ? 'chip is-active' : 'chip'
                  }
                  onClick={() => {
                    setTimeoutSec(String(sec))
                    setNote('')
                  }}
                >
                  {queryTimeoutPresetLabel(sec)}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>软超时（秒，0 = 不限制）</span>
            <input
              type="number"
              min={0}
              max={600}
              step={1}
              value={timeoutSec}
              onChange={(event) => {
                setTimeoutSec(event.target.value)
                setNote('')
              }}
            />
          </label>
          <p className="field-hint">{queryTimeoutHint()}</p>
          {note ? (
            <p className={note.startsWith('已') ? 'field-ok' : 'field-error'}>{note}</p>
          ) : null}
        </>
      ) : null}
      {showSlow ? (
        <>
          <label className="field" style={{ marginTop: showTimeout ? 16 : 0 }}>
            <span>慢查询阈值（毫秒）</span>
            <input
              type="number"
              min={50}
              max={600000}
              step={50}
              value={slowMs}
              onChange={(event) => setSlowMs(event.target.value)}
            />
          </label>
          <p className="field-hint">超过该耗时在结果区与历史标记「慢」。默认 1000 ms。</p>
        </>
      ) : null}
      <div className="dialog-actions">
        {showSlow ? (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void saveSlow()}>
            保存慢查询阈值
          </button>
        ) : null}
        {showTimeout ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveTimeout()}>
            {busy ? '保存中…' : '保存超时'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function AppearancePanel({
  prefs,
  onPrefs,
  visibleIds,
}: {
  prefs: AppPrefs
  onPrefs: (prefs: AppPrefs) => void
  visibleIds: Set<string>
}) {
  const api = getApi()
  const ws = useWorkspace()
  const [busy, setBusy] = useState(false)

  const setDensity = async (density: UiDensity) => {
    setBusy(true)
    try {
      const next = await api.prefs.save({ density })
      onPrefs(next)
      ws.pushToast('success', densityChangedToast(density))
    } finally {
      setBusy(false)
    }
  }

  const setHighContrast = async (highContrast: boolean) => {
    setBusy(true)
    try {
      const next = await api.prefs.save({ highContrast })
      onPrefs(next)
    } finally {
      setBusy(false)
    }
  }

  const setAccent = async (accent: UiAccent) => {
    setBusy(true)
    try {
      const next = await api.prefs.save({ accent })
      onPrefs(next)
      ws.pushToast('success', accentChangedToast(accent))
    } finally {
      setBusy(false)
    }
  }

  const setRestoreTabs = async (restoreTabsOnLaunch: boolean) => {
    setBusy(true)
    try {
      const next = await api.prefs.save({ restoreTabsOnLaunch })
      onPrefs(next)
      ws.pushToast(
        'success',
        next.restoreTabsOnLaunch !== false
          ? sessionRestoreEnabledToast()
          : sessionRestoreDisabledToast(),
      )
    } finally {
      setBusy(false)
    }
  }

  const setGlobalReadOnly = async (globalReadOnly: boolean) => {
    setBusy(true)
    try {
      await ws.setGlobalReadOnly(globalReadOnly)
      const next = await api.prefs.get()
      onPrefs(next)
    } finally {
      setBusy(false)
    }
  }

  const setAlwaysOnTop = async (alwaysOnTop: boolean) => {
    setBusy(true)
    try {
      try {
        const result = await api.window.setAlwaysOnTop(alwaysOnTop)
        const next = await api.prefs.get()
        onPrefs({ ...next, alwaysOnTop: result.alwaysOnTop })
      } catch {
        const next = await api.prefs.save({ alwaysOnTop })
        onPrefs(next)
      }
    } finally {
      setBusy(false)
    }
  }

  const setNotifyOnErrorOnly = async (notifyOnErrorOnly: boolean) => {
    setBusy(true)
    try {
      await ws.setNotifyOnErrorOnly(notifyOnErrorOnly)
      const next = await api.prefs.get()
      onPrefs(next)
    } finally {
      setBusy(false)
    }
  }

  const setNotifyOnSlowQuery = async (notifyOnSlowQuery: boolean) => {
    setBusy(true)
    try {
      await ws.setNotifyOnSlowQuery(notifyOnSlowQuery)
      const next = await api.prefs.get()
      onPrefs(next)
    } finally {
      setBusy(false)
    }
  }

  const setEditorMinimap = async (editorMinimap: boolean) => {
    setBusy(true)
    try {
      await ws.setEditorMinimap(editorMinimap)
      const next = await api.prefs.get()
      onPrefs(next)
    } finally {
      setBusy(false)
    }
  }

  const setEditorBracketColorization = async (editorBracketColorization: boolean) => {
    setBusy(true)
    try {
      await ws.setEditorBracketColorization(editorBracketColorization)
      const next = await api.prefs.get()
      onPrefs(next)
    } finally {
      setBusy(false)
    }
  }

  const setEditorWordWrap = async (editorWordWrap: boolean) => {
    setBusy(true)
    try {
      await ws.setEditorWordWrap(editorWordWrap)
      const next = await api.prefs.get()
      onPrefs(next)
    } finally {
      setBusy(false)
    }
  }

  const setEditorFontSize = async (editorFontSize: number) => {
    setBusy(true)
    try {
      await ws.setEditorFontSize(clampEditorFontSize(editorFontSize))
      const next = await api.prefs.get()
      onPrefs(next)
    } finally {
      setBusy(false)
    }
  }

  const applyZoom = async (factor: number) => {
    setBusy(true)
    try {
      try {
        const result = await api.window.setZoomFactor(clampZoomFactor(factor))
        const next = await api.prefs.get()
        onPrefs({ ...next, zoomFactor: result.zoomFactor })
      } catch {
        const next = await api.prefs.save({ zoomFactor: clampZoomFactor(factor) })
        onPrefs(next)
      }
    } finally {
      setBusy(false)
    }
  }

  const setWelcomeVisible = async (showWelcome: boolean) => {
    setBusy(true)
    try {
      const next = await api.prefs.save({ welcomeDismissed: !showWelcome })
      onPrefs(next)
    } finally {
      setBusy(false)
    }
  }

  const show = (id: string) => visibleIds.has(id)

  return (
    <div className="settings-card">
      {show('density') || show('highContrast') || show('zoom') || show('accent') ? (
        <EmptyState
          compact
          kicker={appearanceThemeKicker()}
          title={appearanceThemeTitle()}
          body={appearanceThemeLead()}
        />
      ) : null}
      {show('accent') ? (
        <div className="accent-grid" role="radiogroup" aria-label="强调色">
          {ACCENT_OPTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={prefs.accent === item.id}
              className={prefs.accent === item.id ? 'accent-card is-active' : 'accent-card'}
              disabled={busy}
              onClick={() => void setAccent(item.id)}
            >
              <span className="accent-swatch" style={{ background: item.swatch }} aria-hidden="true" />
              <span className="accent-card-copy">
                <strong>{item.label}</strong>
                <span>{item.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {show('density') ? (
        <div className="density-section">
          <EmptyState
            compact
            kicker="布局"
            title={densitySectionTitle()}
            body={densitySectionBody()}
          />
          <div className="density-grid" role="radiogroup" aria-label="界面密度">
            {(
              [
                {
                  id: 'comfortable' as const,
                  title: densityComfortableTitle(),
                  body: densityComfortableBlurb(),
                },
                {
                  id: 'compact' as const,
                  title: densityCompactTitle(),
                  body: densityCompactBlurb(),
                },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={prefs.density === item.id}
                className={prefs.density === item.id ? 'density-card is-active' : 'density-card'}
                disabled={busy}
                onClick={() => void setDensity(item.id)}
              >
                <strong>{item.title}</strong>
                <span className="density-card-body">{item.body}</span>
                <span className={item.id === 'compact' ? 'density-preview is-compact' : 'density-preview'} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {show('zoom') ? (
        <div className="contrast-block">
          <div className="contrast-copy">
            <strong>界面缩放</strong>
            <span>
              整体界面缩放（{Math.round(ZOOM_MIN * 100)}%–
              {Math.round(ZOOM_MAX * 100)}%）。与状态栏缩放、Ctrl+= / Ctrl+- / Ctrl+0 同源。
            </span>
          </div>
          <div className="settings-zoom-controls">
            <button
              type="button"
              className="btn btn-ghost tiny-btn"
              disabled={busy || prefs.zoomFactor <= ZOOM_MIN}
              aria-label="缩小"
              onClick={() => void applyZoom(stepZoomFactor(prefs.zoomFactor, -1))}
            >
              −
            </button>
            <span className="settings-zoom-value">{formatZoomPercent(prefs.zoomFactor)}</span>
            <button
              type="button"
              className="btn btn-ghost tiny-btn"
              disabled={busy || prefs.zoomFactor >= ZOOM_MAX}
              aria-label="放大"
              onClick={() => void applyZoom(stepZoomFactor(prefs.zoomFactor, 1))}
            >
              +
            </button>
            <button
              type="button"
              className="btn btn-ghost tiny-btn"
              disabled={busy || prefs.zoomFactor === 1}
              onClick={() => void applyZoom(1)}
            >
              重置
            </button>
          </div>
        </div>
      ) : null}
      {show('highContrast') ? (
        <div className="contrast-block">
          <div className="contrast-copy">
            <strong>高对比度</strong>
            <span>{highContrastHint()}</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.highContrast}
            className={prefs.highContrast ? 'contrast-switch is-on' : 'contrast-switch'}
            disabled={busy}
            onClick={() => void setHighContrast(!prefs.highContrast)}
          >
            {prefs.highContrast ? '已开启' : '已关闭'}
          </button>
        </div>
      ) : null}
      {show('restoreTabsOnLaunch') ? (
        <div className="contrast-block">
          <div className="contrast-copy">
            <strong>{sessionRestoreSettingTitle()}</strong>
            <span>{sessionRestoreSettingBody()}</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.restoreTabsOnLaunch}
            className={prefs.restoreTabsOnLaunch ? 'contrast-switch is-on' : 'contrast-switch'}
            disabled={busy}
            title={sessionRestoreSettingBody()}
            onClick={() => void setRestoreTabs(!prefs.restoreTabsOnLaunch)}
          >
            {prefs.restoreTabsOnLaunch
              ? sessionRestoreSettingOnLabel()
              : sessionRestoreSettingOffLabel()}
          </button>
        </div>
      ) : null}
      {show('globalReadOnly') ? (
        <div className="contrast-block">
          <div className="contrast-copy">
            <strong>全局只读</strong>
            <span>拦截所有连接的 INSERT / UPDATE / DELETE / DDL、单元格编辑与导入；SELECT / EXPLAIN / 导出仍可用。也可在连接对话框设单连接只读。</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.globalReadOnly}
            className={prefs.globalReadOnly ? 'contrast-switch is-on' : 'contrast-switch'}
            disabled={busy}
            onClick={() => void setGlobalReadOnly(!prefs.globalReadOnly)}
          >
            {prefs.globalReadOnly ? '已开启' : '已关闭'}
          </button>
        </div>
      ) : null}
      {show('alwaysOnTop') ? (
        <div className="contrast-block">
          <div className="contrast-copy">
            <strong>窗口置顶</strong>
            <span>始终显示在其他窗口之上。也可点标题栏「置顶」或 Ctrl+K 搜索「置顶」。</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.alwaysOnTop}
            className={prefs.alwaysOnTop ? 'contrast-switch is-on' : 'contrast-switch'}
            disabled={busy}
            onClick={() => void setAlwaysOnTop(!prefs.alwaysOnTop)}
          >
            {prefs.alwaysOnTop ? '已开启' : '已关闭'}
          </button>
        </div>
      ) : null}
      {show('notifyOnErrorOnly') ? (
        <div className="contrast-block">
          <div className="contrast-copy">
            <strong>通知：仅错误</strong>
            <span>通知中心（标题栏「通知」）只保留失败 / 警告，不记录查询与导入成功。</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.notifyOnErrorOnly}
            className={prefs.notifyOnErrorOnly ? 'contrast-switch is-on' : 'contrast-switch'}
            disabled={busy}
            onClick={() => void setNotifyOnErrorOnly(!prefs.notifyOnErrorOnly)}
          >
            {prefs.notifyOnErrorOnly ? '已开启' : '已关闭'}
          </button>
        </div>
      ) : null}
      {show('notifyOnSlowQuery') ? (
        <div className="contrast-block">
          <div className="contrast-copy">
            <strong>通知：慢查询</strong>
            <span>运行超过慢查询阈值时写入通知中心（默认关闭）。</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.notifyOnSlowQuery}
            className={prefs.notifyOnSlowQuery ? 'contrast-switch is-on' : 'contrast-switch'}
            disabled={busy}
            onClick={() => void setNotifyOnSlowQuery(!prefs.notifyOnSlowQuery)}
          >
            {prefs.notifyOnSlowQuery ? '已开启' : '已关闭'}
          </button>
        </div>
      ) : null}
      {show('editorMinimap') ? (
        <div className="contrast-block">
          <div className="contrast-copy">
            <strong>编辑器小地图</strong>
            <span>Monaco 右侧缩略图。默认可关；也可 Ctrl+K 搜索「小地图」。</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.editorMinimap}
            className={prefs.editorMinimap ? 'contrast-switch is-on' : 'contrast-switch'}
            disabled={busy}
            onClick={() => void setEditorMinimap(!prefs.editorMinimap)}
          >
            {prefs.editorMinimap ? '已开启' : '已关闭'}
          </button>
        </div>
      ) : null}
      {show('editorWordWrap') ? (
        <div className="contrast-block">
          <div className="contrast-copy">
            <strong>自动换行</strong>
            <span>SQL 编辑器软换行。默认关闭（横向滚动）；Alt+Z 或 Ctrl+K「换行」可切换。</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.editorWordWrap}
            className={prefs.editorWordWrap ? 'contrast-switch is-on' : 'contrast-switch'}
            disabled={busy}
            onClick={() => void setEditorWordWrap(!prefs.editorWordWrap)}
          >
            {prefs.editorWordWrap ? '已开启' : '已关闭'}
          </button>
        </div>
      ) : null}
      {show('editorBracketColorization') ? (
        <div className="contrast-block">
          <div className="contrast-copy">
            <strong>括号配对着色</strong>
            <span>彩色括号与配对引导线，便于嵌套 SQL。默认开启；Ctrl+K「括号」可切换。</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.editorBracketColorization}
            className={prefs.editorBracketColorization ? 'contrast-switch is-on' : 'contrast-switch'}
            disabled={busy}
            onClick={() => void setEditorBracketColorization(!prefs.editorBracketColorization)}
          >
            {prefs.editorBracketColorization ? '已开启' : '已关闭'}
          </button>
        </div>
      ) : null}
      {show('editorFontSize') ? (
        <div className="contrast-block">
          <div className="contrast-copy">
            <strong>编辑器字号</strong>
            <span>SQL 编辑器字体大小（12–20），即时生效并记住。</span>
          </div>
          <label className="editor-font-size">
            <span className="editor-font-size-value">{prefs.editorFontSize}</span>
            <input
              type="range"
              min={EDITOR_FONT_MIN}
              max={EDITOR_FONT_MAX}
              step={1}
              value={prefs.editorFontSize}
              disabled={busy}
              aria-label="编辑器字号"
              onChange={(event) => void setEditorFontSize(Number(event.target.value))}
            />
          </label>
        </div>
      ) : null}
      {show('welcomeDismissed') ? (
        <div className="contrast-block">
          <div className="contrast-copy">
            <strong>无连接时显示欢迎页</strong>
            <span>
              尚无数据库连接时展示引导（示例库 / 新建 / 导入与上手提示）。关闭后可在此重新打开。
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!prefs.welcomeDismissed}
            className={!prefs.welcomeDismissed ? 'contrast-switch is-on' : 'contrast-switch'}
            disabled={busy}
            onClick={() => void setWelcomeVisible(prefs.welcomeDismissed)}
          >
            {!prefs.welcomeDismissed ? '已开启' : '已关闭'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function AboutPanel({
  version,
  encryption,
  mode,
}: {
  version: string
  encryption?: 'os' | 'unavailable'
  mode?: 'desktop' | 'preview'
}) {
  const api = getApi()
  const ws = useWorkspace()
  const [note, setNote] = useState('')

  const openPath = async (kind: 'userData' | 'logs') => {
    const result = kind === 'userData' ? await api.app.openUserData() : await api.app.openLogs()
    if (!result.ok) {
      setNote(result.error)
      return
    }
    setNote(`已打开：${result.path}`)
  }

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text)
      ws.pushToast('success', okMsg)
      setNote(okMsg)
    } catch {
      ws.pushToast('error', '复制失败，请检查剪贴板权限')
      setNote('复制失败，请检查剪贴板权限')
    }
  }

  const changelogItems = RELEASE_NOTES_SNIPPET.items

  return (
    <div className="about-stack">
      <article className="about-hero">
        <Mark size={28} />
        <div>
          <h4>DataAI</h4>
          <p>本地优先的数据库工作台 · 自然语言转 SQL · 深色专业壳</p>
        </div>
        <div className="about-hero-badges">
          <span className="about-version">{aboutVersionBadge(version)}</span>
          <span className="about-channel">{aboutChannelLabel(mode)}</span>
        </div>
      </article>
      <article className="settings-card about-card">
        <p className="settings-lead">
          DataAI 把连接管理、SQL 编辑、结果分析与助手工具链放在同一深色工作区。密钥与连接密码使用系统密封存储；查询历史、收藏与会话记忆只留在本机。
        </p>
        <ul className="about-meta">
          <li>
            <span>版本</span>
            <strong>{aboutVersionCopyText(version)}</strong>
          </li>
          <li>
            <span>通道</span>
            <strong>{aboutChannelLabel(mode)}</strong>
          </li>
          <li>
            <span>密钥环</span>
            <strong>{aboutEncryptionLabel(encryption)}</strong>
          </li>
          <li>
            <span>许可</span>
            <strong>MIT</strong>
          </li>
        </ul>
        <div className="about-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void copyText(aboutVersionCopyText(version), '已复制版本号')}
          >
            {aboutCopyVersionLabel()}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              void copyText(
                aboutDiagnosticsText({ version, encryption, mode }),
                '已复制诊断信息',
              )
            }
          >
            {aboutCopyDiagnosticsLabel()}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void openPath('userData')}>
            打开工作区目录
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void openPath('logs')}>
            打开日志目录
          </button>
        </div>
        {note && <p className="field-hint">{note}</p>}
      </article>
      <article className="settings-card about-card about-changelog">
        <h4 className="about-changelog-title">{releaseNotesTitle(version)}</h4>
        {changelogItems.length === 0 ? (
          <EmptyState compact kicker="更新" title="暂无摘要" body={aboutChangelogEmptyBody()} />
        ) : (
          <ul className="about-changelog-list">
            {changelogItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        <p className="field-hint">完整日志：仓库内 apps/desktop/CHANGELOG.md</p>
      </article>
    </div>
  )
}
