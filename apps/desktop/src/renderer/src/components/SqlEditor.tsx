import { useEffect, useRef, useState } from 'react'
import { KeyCode, KeyMod, editor, languages, type IDisposable } from 'monaco-editor/editor/editor.api'
import { conf, language } from 'monaco-editor/languages/definitions/sql/sql'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import {
  detectSqlSuggestContext,
  filterSuggestions,
  schemaSuggestObjectCount,
  suggestEditorOverlayBody,
  type SchemaSuggestItem,
} from '@shared/schemaSuggest'
import { emitDataai, onDataai } from '../appEvents'
import { pickRunSql, selectionIsNonEmpty } from '@shared/runSqlPick'
import { isSqlDragEvent, readSqlDragText } from '@shared/sqlDragDrop'
import { isOsFileDrag } from '@shared/sqlFileDrop'
import { readDroppedSqlFiles } from '../sqlFileDropRead'
import { formatSql } from '@shared/sqlFormat'
import { clampGotoLineTarget } from '@shared/gotoLine'
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
      'editorBracketHighlight.foreground1': '#9EB4FF',
      'editorBracketHighlight.foreground2': '#4FD1C5',
      'editorBracketHighlight.foreground3': '#E6C35C',
      'editorBracketHighlight.foreground4': '#C792EA',
      'editorBracketHighlight.foreground5': '#7DDEA2',
      'editorBracketHighlight.foreground6': '#FF9E64',
      'editorBracketMatch.background': '#2A3A6655',
      'editorBracketMatch.border': '#9EB4FF',
      'editorBracketPairGuide.background1': '#9EB4FF33',
      'editorBracketPairGuide.background2': '#4FD1C533',
      'editorBracketPairGuide.background3': '#E6C35C33',
      'editorBracketPairGuide.background4': '#C792EA33',
      'editorBracketPairGuide.background5': '#7DDEA233',
      'editorBracketPairGuide.background6': '#FF9E6433',
      'editorBracketPairGuide.activeBackground1': '#9EB4FF88',
      'editorBracketPairGuide.activeBackground2': '#4FD1C588',
      'editorBracketPairGuide.activeBackground3': '#E6C35C88',
      'editorBracketPairGuide.activeBackground4': '#C792EA88',
      'editorBracketPairGuide.activeBackground5': '#7DDEA288',
      'editorBracketPairGuide.activeBackground6': '#FF9E6488',
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
      const context = detectSqlSuggestContext(line)
      const filtered = filterSuggestions(pool, prefix, 40, context)
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
  /** Non-empty primary selection stats for status bar; null when collapsed. */
  onSelectionChange?: (info: { charCount: number; lineCount: number } | null) => void
  suggestions?: SchemaSuggestItem[]
  minimap?: boolean
  fontSize?: number
  wordWrap?: boolean
  /** Bracket pair colorization + guides. Default on. */
  bracketColorization?: boolean
  /** OS .sql/.txt file drops → open as tabs. */
  onOpenDroppedFiles?: (items: { name: string; content: string }[]) => void
}

export function SqlEditor({
  value,
  onChange,
  onCursor,
  onSelectionChange,
  suggestions = [],
  minimap = false,
  fontSize = DEFAULT_EDITOR_FONT_SIZE,
  wordWrap = false,
  bracketColorization = true,
  onOpenDroppedFiles,
}: SqlEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const onChangeRef = useRef(onChange)
  const onCursorRef = useRef(onCursor)
  const onSelectionChangeRef = useRef(onSelectionChange)
  onChangeRef.current = onChange
  onCursorRef.current = onCursor
  onSelectionChangeRef.current = onSelectionChange
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
      wordWrap: wordWrap ? 'on' : 'off',
      matchBrackets: bracketColorization ? 'always' : 'near',
      bracketPairColorization: {
        enabled: bracketColorization === true,
        independentColorPoolPerBracketType: true,
      },
      automaticLayout: true,
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      guides: {
        indentation: false,
        bracketPairs: bracketColorization === true,
        bracketPairsHorizontal: bracketColorization === true ? 'active' : false,
        highlightActiveBracketPair: bracketColorization === true,
      },
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

    const reportSelection = () => {
      const cb = onSelectionChangeRef.current
      if (!cb) return
      const model = instance.getModel()
      const sel = instance.getSelection()
      if (!model || !sel || sel.isEmpty()) {
        cb(null)
        return
      }
      const text = model.getValueInRange(sel)
      if (!text) {
        cb(null)
        return
      }
      cb({
        charCount: text.length,
        lineCount: Math.max(1, Math.abs(sel.endLineNumber - sel.startLineNumber) + 1),
      })
    }
    const position = instance.getPosition()
    if (position) onCursorRef.current({ line: position.lineNumber, column: position.column })
    reportSelection()
    const cursorSub = instance.onDidChangeCursorPosition((event) => {
      onCursorRef.current({ line: event.position.lineNumber, column: event.position.column })
    })
    const selectionSub = instance.onDidChangeCursorSelection(() => {
      reportSelection()
    })
    const changeSub = instance.onDidChangeModelContent(() => {
      onChangeRef.current(instance.getValue())
      reportSelection()
    })
    return () => {
      cursorSub.dispose()
      selectionSub.dispose()
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
      wordWrap: wordWrap ? 'on' : 'off',
      lineHeight: editorLineHeight(size),
      matchBrackets: bracketColorization ? 'always' : 'near',
      bracketPairColorization: {
        enabled: bracketColorization === true,
        independentColorPoolPerBracketType: true,
      },
      guides: {
        indentation: false,
        bracketPairs: bracketColorization === true,
        bracketPairsHorizontal: bracketColorization === true ? 'active' : false,
        highlightActiveBracketPair: bracketColorization === true,
      },
    })
  }, [minimap, fontSize, wordWrap, bracketColorization])


  useEffect(
    () =>
      onDataai('dataai:peek-run-sql', (detail) => {
        const instance = instanceRef.current
        const full = instance?.getValue() ?? value
        const selection = instance?.getSelection()
        let selected: string | null = null
        if (
          selection &&
          selectionIsNonEmpty(
            selection.startLineNumber,
            selection.startColumn,
            selection.endLineNumber,
            selection.endColumn,
          )
        ) {
          const model = instance?.getModel()
          selected = model ? model.getValueInRange(selection) : null
        }
        detail.respond(pickRunSql(full, selected))
      }),
    [value],
  )

  useEffect(() => onDataai('dataai:focus-editor', () => {
    instanceRef.current?.focus()
  }), [])

  useEffect(
    () =>
      onDataai('dataai:goto-line', (detail) => {
        const instance = instanceRef.current
        if (!instance || !detail) return
        const model = instance.getModel()
        if (!model) return
        const target = clampGotoLineTarget(detail, model.getLineCount(), (line) =>
          model.getLineMaxColumn(line),
        )
        const position = { lineNumber: target.line, column: target.column }
        instance.setPosition(position)
        instance.revealPositionInCenter(position)
        instance.focus()
      }),
    [],
  )

  useEffect(
    () =>
      onDataai('dataai:format-sql', () => {
        const instance = instanceRef.current
        if (!instance) return
        const model = instance.getModel()
        if (!model) return
        const selection = instance.getSelection()
        const fromSelection =
          !!selection &&
          (selection.startLineNumber !== selection.endLineNumber ||
            selection.startColumn !== selection.endColumn)
        let changed = false
        if (fromSelection && selection) {
          const selected = model.getValueInRange(selection)
          const formatted = formatSql(selected)
          if (formatted !== selected) {
            instance.executeEdits('format-sql', [
              { range: selection, text: formatted, forceMoveMarkers: true },
            ])
            changed = true
          }
        } else {
          const full = model.getValue()
          const formatted = formatSql(full)
          if (formatted !== full) {
            instance.executeEdits('format-sql', [
              { range: model.getFullModelRange(), text: formatted, forceMoveMarkers: true },
            ])
            changed = true
          }
        }
        emitDataai('dataai:sql-format-done', { changed, fromSelection })
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
      onDataai('dataai:insert-at-cursor', (detail) => {
        const instance = instanceRef.current
        const text = detail?.text
        if (!instance || text == null || text === '') return
        const selection = instance.getSelection()
        if (selection) {
          instance.executeEdits('dataai-insert-ident', [
            { range: selection, text, forceMoveMarkers: true },
          ])
        }
        instance.focus()
      }),
    [],
  )

  useEffect(
    () =>
      onDataai('dataai:find', () => {
        const instance = instanceRef.current
        if (!instance) return
        instance.focus()
        const sel = instance.getSelection()
        const model = instance.getModel()
        let charCount = 0
        let lineCount = 0
        if (sel && model && !sel.isEmpty()) {
          charCount = model.getValueInRange(sel).length
          lineCount = Math.max(1, sel.endLineNumber - sel.startLineNumber + 1)
        }
        void instance.getAction('actions.find')?.run()
        if (charCount > 0) {
          emitDataai('dataai:editor-find-opened', { mode: 'find', charCount, lineCount })
        }
      }),
    [],
  )

  useEffect(
    () =>
      onDataai('dataai:replace', () => {
        const instance = instanceRef.current
        if (!instance) return
        instance.focus()
        const sel = instance.getSelection()
        const model = instance.getModel()
        let charCount = 0
        let lineCount = 0
        if (sel && model && !sel.isEmpty()) {
          charCount = model.getValueInRange(sel).length
          lineCount = Math.max(1, sel.endLineNumber - sel.startLineNumber + 1)
        }
        void instance.getAction('editor.action.startFindReplaceAction')?.run()
        if (charCount > 0) {
          emitDataai('dataai:editor-find-opened', { mode: 'replace', charCount, lineCount })
        }
      }),
    [],
  )

  const insertAtClientPoint = (clientX: number, clientY: number, text: string) => {
    const instance = instanceRef.current
    if (!instance || !text) return
    const target = instance.getTargetAtClientPoint(clientX, clientY)
    const position = target?.position ?? instance.getPosition()
    if (!position) {
      const model = instance.getModel()
      if (!model) return
      const lastLine = model.getLineCount()
      const lastCol = model.getLineMaxColumn(lastLine)
      instance.executeEdits('dataai-sql-drop', [
        {
          range: {
            startLineNumber: lastLine,
            startColumn: lastCol,
            endLineNumber: lastLine,
            endColumn: lastCol,
          },
          text,
          forceMoveMarkers: true,
        },
      ])
    } else {
      instance.setPosition(position)
      instance.executeEdits('dataai-sql-drop', [
        {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          text,
          forceMoveMarkers: true,
        },
      ])
    }
    instance.focus()
  }

  return (
    <div
      className={dragOver ? 'editor-wrap is-drop-target' : 'editor-wrap'}
      onDragEnter={(event) => {
        const types = event.dataTransfer.types
        if (!isOsFileDrag(types) && !isSqlDragEvent(types)) return
        event.preventDefault()
        setDragOver(true)
      }}
      onDragOver={(event) => {
        const types = event.dataTransfer.types
        if (!isOsFileDrag(types) && !isSqlDragEvent(types)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setDragOver(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return
        setDragOver(false)
      }}
      onDrop={(event) => {
        const types = event.dataTransfer.types
        if (isOsFileDrag(types) && onOpenDroppedFiles) {
          event.preventDefault()
          setDragOver(false)
          void readDroppedSqlFiles(event.dataTransfer.files).then((items) => {
            if (items.length === 0) return
            onOpenDroppedFiles(items)
          })
          return
        }
        if (!isSqlDragEvent(types)) return
        event.preventDefault()
        setDragOver(false)
        const text = readSqlDragText(event.dataTransfer)
        if (!text) return
        insertAtClientPoint(event.clientX, event.clientY, text)
      }}
    >
      <div ref={host} className="monaco-host" />
      {dragOver && (
        <div className="editor-drop-hint" aria-hidden="true">
          放到此处：插入片段，或打开 .sql / .txt 文件
        </div>
      )}
      {value.trim() === '' && !dragOver && (
        <div className="editor-overlay">
          {suggestEditorOverlayBody(schemaSuggestObjectCount(suggestions) > 0)}
        </div>
      )}
    </div>
  )
}
