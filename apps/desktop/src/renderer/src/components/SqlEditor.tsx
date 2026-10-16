import { useEffect, useRef } from 'react'
import { editor, languages } from 'monaco-editor/editor/editor.api'
import { conf, language } from 'monaco-editor/languages/definitions/sql/sql'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'

globalThis.MonacoEnvironment = {
  getWorker() {
    return new editorWorker()
  },
}

let languageReady = false

function ensureSql() {
  if (languageReady) return
  languageReady = true
  languages.register({ id: 'sql' })
  languages.setLanguageConfiguration('sql', conf as languages.LanguageConfiguration)
  languages.setMonarchTokensProvider('sql', language as languages.IMonarchLanguage)
  editor.defineTheme('dataai-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '9EB4FF' },
      { token: 'string', foreground: 'B7D4A8' },
      { token: 'number', foreground: 'E6C07B' },
      { token: 'comment', foreground: '7E879A' },
      { token: 'operator', foreground: 'C5CDD8' },
    ],
    colors: {
      'editor.background': '#0c0e13',
      'editor.foreground': '#E8EDF7',
      'editorLineNumber.foreground': '#5C6578',
      'editorLineNumber.activeForeground': '#A8B0C2',
      'editor.lineHighlightBackground': '#141924',
      'editor.selectionBackground': '#2A3A6688',
      'editorCursor.foreground': '#9EB4FF',
      'editorWidget.background': '#161B26',
      'editorWidget.border': '#2A3142',
    },
  })
}

type SqlEditorProps = {
  value: string
  onChange: (value: string) => void
  onCursor: (cursor: { line: number; column: number }) => void
}

export function SqlEditor({ value, onChange, onCursor }: SqlEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)
  const onCursorRef = useRef(onCursor)
  onChangeRef.current = onChange
  onCursorRef.current = onCursor

  useEffect(() => {
    const node = host.current
    if (!node) return
    ensureSql()
    const instance = editor.create(node, {
      value,
      language: 'sql',
      theme: 'dataai-dark',
      fontFamily: '"JetBrains Mono", "Noto Sans SC", ui-monospace, monospace',
      fontSize: 13,
      lineHeight: 22,
      fontLigatures: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 14, bottom: 14 },
      renderLineHighlight: 'line',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      tabSize: 2,
      wordWrap: 'off',
      automaticLayout: true,
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      guides: { indentation: false },
      occurrencesHighlight: 'off',
      renderWhitespace: 'none',
      stickyScroll: { enabled: false },
    })
    instanceRef.current = instance
    const position = instance.getPosition()
    if (position) onCursorRef.current({ line: position.lineNumber, column: position.column })
    const cursorSub = instance.onDidChangeCursorPosition((event) => {
      onCursorRef.current({ line: event.position.lineNumber, column: event.position.column })
    })
    const changeSub = instance.onDidChangeModelContent(() => {
      onChangeRef.current(instance.getValue())
    })
    return () => {
      cursorSub.dispose()
      changeSub.dispose()
      instance.dispose()
      instanceRef.current = null
  }
  }, [])

  useEffect(() => {
    const instance = instanceRef.current
    if (!instance) return
    if (instance.getValue() !== value) instance.setValue(value)
  }, [value])

  return (
    <div className="editor-wrap">
      <div ref={host} className="monaco-host" />
      {value.trim() === '' && <div className="editor-overlay">编写 SQL，按 F5 运行</div>}
    </div>
  )
}
