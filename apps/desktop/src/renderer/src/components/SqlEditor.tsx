import { useEffect, useRef } from 'react'
import { KeyCode, KeyMod, editor, languages, type IDisposable } from 'monaco-editor/editor/editor.api'
import { conf, language } from 'monaco-editor/languages/definitions/sql/sql'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import { filterSuggestions, type SchemaSuggestItem } from '@shared/schemaSuggest'
import { onDataai } from '../appEvents'
import { formatSql } from '@shared/sqlFormat'
import {
  DEFAULT_EDITOR_FONT_SIZE,
  clampEditorFontSize,
  editorLineHeight,
} from '@shared/prefs'

globalThis.MonacoEnvironment = {
  getWorker() {
    return new editorWorker()
  },
}

let languageReady = false
let completionDisposable: IDisposable | null = null
const suggestionBag: { current: SchemaSuggestItem[] } = { current: [] }

function kindToMonaco(kind: SchemaSuggestItem['kind']): languages.CompletionItemKind {
  if (kind === 'table') return languages.CompletionItemKind.Class
  if (kind === 'column') return languages.CompletionItemKind.Field
  return languages.CompletionItemKind.Keyword
}

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
      'editorSuggestWidget.background': '#161B26',
      'editorSuggestWidget.border': '#2A3142',
      'editorSuggestWidget.selectedBackground': '#2A3A66',
      'editorSuggestWidget.foreground': '#E8EDF7',
      'editor.findMatchBackground': '#6B542088',
      'editor.findMatchHighlightBackground': '#4A3A2088',
      'editor.findRangeHighlightBackground': '#2A3A6644',
      'input.background': '#0c0e13',
      'input.foreground': '#E8EDF7',
      'input.border': '#2A3142',
    },
  })

  completionDisposable?.dispose()
  completionDisposable = languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' ', '_'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }
      const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
      const dotted = line.match(/([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)$/)
      const prefix = dotted?.[2] ?? word.word
      const tableHint = dotted?.[1]?.toLowerCase()
      let pool = suggestionBag.current
      if (tableHint) {
        pool = pool.filter(
          (item) =>
            item.kind === 'column' &&
            (item.detail?.toLowerCase().includes(tableHint) ||
              item.label.toLowerCase().startsWith(`${tableHint}.`) ||
              item.insertText.toLowerCase().startsWith(`${tableHint}.`)),
        )
      }
      const filtered = filterSuggestions(pool, prefix)
      return {
        suggestions: filtered.map((item, index) => ({
          label: item.label,
          kind: kindToMonaco(item.kind),
          detail: item.detail,
          insertText: tableHint && item.insertText.includes('.') ? item.insertText.split('.').pop()! : item.insertText,
          range,
          sortText: `${String(index).padStart(4, '0')}`,
        })),
      }
    },
  })
}

type SqlEditorProps = {
  value: string
  onChange: (value: string) => void
  onCursor: (cursor: { line: number; column: number }) => void
  suggestions?: SchemaSuggestItem[]
  minimap?: boolean
  fontSize?: number
}

export function SqlEditor({
  value,
  onChange,
  onCursor,
  suggestions = [],
  minimap = false,
  fontSize = DEFAULT_EDITOR_FONT_SIZE,
}: SqlEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)
  const onCursorRef = useRef(onCursor)
  onChangeRef.current = onChange
  onCursorRef.current = onCursor
  suggestionBag.current = suggestions

  useEffect(() => {
    suggestionBag.current = suggestions
  }, [suggestions])

  useEffect(() => {
    const node = host.current
    if (!node) return
    ensureSql()
    const instance = editor.create(node, {
      value,
      language: 'sql',
      theme: 'dataai-dark',
      fontFamily: '"JetBrains Mono", "Noto Sans SC", ui-monospace, monospace',
      fontSize: clampEditorFontSize(fontSize),
      lineHeight: editorLineHeight(fontSize),
      fontLigatures: true,
      minimap: { enabled: minimap === true },
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
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
      wordBasedSuggestions: 'off',
      snippetSuggestions: 'none',
      suggest: {
        showKeywords: true,
        showSnippets: false,
        preview: true,
        insertMode: 'replace',
      },
      find: {
        seedSearchStringFromSelection: 'selection',
        autoFindInSelection: 'multiline',
        addExtraSpaceOnTop: false,
      },
    })
    instanceRef.current = instance

    // Ensure Ctrl+/ toggles SQL `--` line comments (language conf already sets lineComment).
    instance.addAction({
      id: 'dataai.toggleLineComment',
      label: '切换行注释',
      keybindings: [KeyMod.CtrlCmd | KeyCode.Slash],
      precondition: undefined,
      run: (ed) => {
        void ed.getAction('editor.action.commentLine')?.run()
      },
    })

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

  useEffect(() => {
    const instance = instanceRef.current
    if (!instance) return
    const size = clampEditorFontSize(fontSize)
    instance.updateOptions({
      minimap: { enabled: minimap === true },
      fontSize: size,
      lineHeight: editorLineHeight(size),
    })
  }, [minimap, fontSize])

  useEffect(() => onDataai('dataai:focus-editor', () => {
    instanceRef.current?.focus()
  }), [])

  useEffect(
    () =>
      onDataai('dataai:format-sql', () => {
        const instance = instanceRef.current
        if (!instance) return
        const model = instance.getModel()
        if (!model) return
        const selection = instance.getSelection()
        const hasSelection =
          !!selection &&
          (selection.startLineNumber !== selection.endLineNumber ||
            selection.startColumn !== selection.endColumn)
        if (hasSelection && selection) {
          const selected = model.getValueInRange(selection)
          const formatted = formatSql(selected)
          if (formatted !== selected) {
            instance.executeEdits('format-sql', [
              { range: selection, text: formatted, forceMoveMarkers: true },
            ])
          }
        } else {
          const full = model.getValue()
          const formatted = formatSql(full)
          if (formatted !== full) {
            instance.executeEdits('format-sql', [
              { range: model.getFullModelRange(), text: formatted, forceMoveMarkers: true },
            ])
          }
        }
        instance.focus()
      }),
    [],
  )

  useEffect(
    () =>
      onDataai('dataai:toggle-comment', () => {
        const instance = instanceRef.current
        if (!instance) return
        instance.focus()
        void instance.getAction('editor.action.commentLine')?.run()
      }),
    [],
  )

  useEffect(
    () =>
      onDataai('dataai:find', () => {
        const instance = instanceRef.current
        if (!instance) return
        instance.focus()
        void instance.getAction('actions.find')?.run()
      }),
    [],
  )

  useEffect(
    () =>
      onDataai('dataai:replace', () => {
        const instance = instanceRef.current
        if (!instance) return
        instance.focus()
        void instance.getAction('editor.action.startFindReplaceAction')?.run()
      }),
    [],
  )

  return (
    <div className="editor-wrap">
      <div ref={host} className="monaco-host" />
      {value.trim() === '' && (
        <div className="editor-overlay">编写 SQL，按 F5 运行 · Ctrl+Space 补全表/列</div>
      )}
    </div>
  )
}
