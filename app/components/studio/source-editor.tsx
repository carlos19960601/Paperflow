"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { keymap } from "@codemirror/view"
import { autocompletion } from "@codemirror/autocomplete"
import { typst_lezer } from "codemirror-lang-typst/lezer"
import { EditorView, basicSetup } from "codemirror"
import {
  lintGutter,
  setDiagnostics as cmSetDiagnostics,
  type Diagnostic,
} from "@codemirror/lint"
import {
  formatTypst,
  formatTypstRange,
  readableFormatError,
} from "@/lib/typst/format"
import { typstHighlight } from "@/lib/typst/highlight"
import { typstCompletionSource } from "@/lib/typst/completions"
import type { TypstDiagnostic } from "@/lib/typst/diagnostics"

type SourceEditorProps = {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  diagnostics?: TypstDiagnostic[]
  onFormatActivity?: (active: boolean) => void
  onFormatError?: (message: string | null) => void
}

export type SourceEditorHandle = {
  insertAtCursor: (text: string) => void
  prependText: (text: string) => void
  formatDocument: () => Promise<void>
  jumpToDiagnostic: (item: TypstDiagnostic) => void
}

function offsetAt(text: string, lineNumber: number, column: number) {
  const lines = text.split("\n")
  const index = Math.min(Math.max(lineNumber, 1), lines.length) - 1
  let offset = 0
  for (let i = 0; i < index; i += 1) {
    offset += lines[i].length + 1
  }
  return offset + Math.min(Math.max(column, 0), (lines[index] ?? "").length)
}

function resolveSpan(
  source: string,
  item: TypstDiagnostic
): { from: number; to: number } {
  const docLen = source.length
  if (docLen === 0) return { from: 0, to: 0 }

  let from = Math.min(Math.max(item.from, 0), docLen)
  if (item.line !== null && item.line > 0) {
    const colZero = item.col !== null && item.col > 0 ? item.col - 1 : 0
    from = Math.min(offsetAt(source, item.line, colZero), docLen)
  }

  let to = Math.min(Math.max(item.to, from), docLen)
  if (to <= from) {
    to = Math.min(from + 1, docLen)
  }
  while (to < docLen && /[a-zA-Z0-9_\-.]/.test(source[to])) {
    to += 1
  }
  return { from, to }
}

function toCmDiagnostics(
  source: string,
  items: TypstDiagnostic[]
): Diagnostic[] {
  if (source.length === 0) return []
  return items.map((item) => {
    const { from, to } = resolveSpan(source, item)
    const fullMessage = item.hint
      ? `${item.message}\n提示：${item.hint}`
      : item.message
    return {
      from,
      to,
      severity: item.severity,
      message: fullMessage,
    }
  })
}

export const SourceEditor = forwardRef<SourceEditorHandle, SourceEditorProps>(
  function SourceEditor(
    {
      value,
      onChange,
      onSave,
      diagnostics,
      onFormatActivity,
      onFormatError,
    },
    ref
  ) {
    const hostRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const onChangeRef = useRef(onChange)
    const onSaveRef = useRef(onSave)
    const onFormatActivityRef = useRef(onFormatActivity)
    const onFormatErrorRef = useRef(onFormatError)
    const applyingRef = useRef(false)
    const formattingRef = useRef(false)
    const formatRef = useRef<() => Promise<void>>(async () => {})

    onChangeRef.current = onChange
    onSaveRef.current = onSave
    onFormatActivityRef.current = onFormatActivity
    onFormatErrorRef.current = onFormatError

    formatRef.current = async () => {
      const view = viewRef.current
      if (!view || formattingRef.current) return
      formattingRef.current = true
      onFormatActivityRef.current?.(true)
      const source = view.state.doc.toString()
      const selection = view.state.selection.main
      const line = view.state.doc.lineAt(selection.head)
      const column = selection.head - line.from
      const range =
        selection.from === selection.to
          ? null
          : { from: selection.from, to: selection.to }
      try {
        if (range) {
          const formatted = await formatTypstRange(source, range.from, range.to)
          const current = viewRef.current
          if (!current || current.state.doc.toString() !== source) return
          if (source.slice(formatted.start, formatted.end) === formatted.text) {
            onFormatErrorRef.current?.(null)
            return
          }
          current.dispatch({
            changes: {
              from: formatted.start,
              to: formatted.end,
              insert: formatted.text,
            },
            selection: { anchor: formatted.start + formatted.text.length },
          })
        } else {
          const formatted = await formatTypst(source)
          const current = viewRef.current
          if (!current || current.state.doc.toString() !== source) return
          if (formatted === source) {
            onFormatErrorRef.current?.(null)
            return
          }
          current.dispatch({
            changes: { from: 0, to: source.length, insert: formatted },
            selection: { anchor: offsetAt(formatted, line.number, column) },
          })
        }
        onFormatErrorRef.current?.(null)
      } catch (error) {
        onFormatErrorRef.current?.(readableFormatError(error))
      } finally {
        formattingRef.current = false
        onFormatActivityRef.current?.(false)
      }
    }

    useImperativeHandle(
      ref,
      () => ({
        insertAtCursor(text: string) {
          const view = viewRef.current
          if (!view) return
          const { from, to } = view.state.selection.main
          view.focus()
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
          })
        },
        prependText(text: string) {
          const view = viewRef.current
          if (!view) return
          const prefix = text.endsWith("\n") ? text : `${text}\n`
          view.focus()
          view.dispatch({
            changes: { from: 0, to: 0, insert: `${prefix}\n` },
            selection: { anchor: prefix.length },
            effects: EditorView.scrollIntoView(0, { y: "start" }),
          })
        },
        formatDocument() {
          return formatRef.current()
        },
        jumpToDiagnostic(item: TypstDiagnostic) {
          const view = viewRef.current
          if (!view) return
          const source = view.state.doc.toString()
          const { from, to } = resolveSpan(source, item)
          view.focus()
          view.dispatch({
            selection: { anchor: from, head: to },
            effects: EditorView.scrollIntoView(from, { y: "center" }),
          })
        },
      }),
      []
    )

    // 创建 CodeMirror 实例
    useEffect(() => {
      const host = hostRef.current
      if (!host) return

      const view = new EditorView({
        parent: host,
        doc: value,
        extensions: [
          basicSetup,
          typst_lezer(),
          typstHighlight,
          lintGutter(),
          autocompletion({
            override: [typstCompletionSource],
            activateOnTyping: true,
            icons: true,
          }),
          EditorView.lineWrapping,
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                onSaveRef.current()
                return true
              },
            },
            {
              key: "Shift-Alt-f",
              preventDefault: true,
              run: () => {
                void formatRef.current()
                return true
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applyingRef.current) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
          EditorView.theme({
            "&": {
              height: "100%",
              backgroundColor: "transparent",
              color: "var(--foreground)",
              fontSize: "13.5px",
            },
            "&.cm-focused": { outline: "none" },
            ".cm-scroller": {
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              lineHeight: "1.65",
              paddingTop: "4px",
            },
            ".cm-gutters": {
              backgroundColor: "transparent",
              color: "var(--muted-foreground)",
              border: "none",
              paddingLeft: "4px",
            },
            ".cm-gutter-lint": {
              width: "1.1rem",
            },
            ".cm-activeLine": {
              backgroundColor:
                "color-mix(in oklch, var(--foreground) 4.5%, transparent)",
            },
            ".cm-activeLineGutter": {
              backgroundColor: "transparent",
              color: "var(--foreground)",
            },
            ".cm-selectionBackground": {
              backgroundColor:
                "color-mix(in oklch, var(--primary) 18%, transparent) !important",
            },
            ".cm-cursor": {
              borderLeftColor: "var(--primary)",
            },
            ".cm-tooltip": {
              backgroundColor: "var(--popover)",
              color: "var(--popover-foreground)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              boxShadow: "0 6px 20px rgba(22, 20, 18, 0.14)",
            },
            ".cm-diagnostic": {
              backgroundColor: "var(--popover)",
              color: "var(--popover-foreground)",
              padding: "6px 10px",
              whiteSpace: "pre-wrap",
              fontSize: "12px",
              lineHeight: "1.5",
            },
            ".cm-diagnostic-error": {
              borderLeft: "1px solid var(--destructive)",
            },
            ".cm-diagnostic-warning": {
              borderLeft: "1px solid var(--warning)",
            },
            ".cm-lintRange-error": {
              textDecoration: "underline wavy var(--destructive)",
              textDecorationSkipInk: "none",
              textDecorationThickness: "0.85px",
              paddingBottom: "2px",
            },
            ".cm-lintRange-warning": {
              textDecoration: "underline wavy var(--warning)",
              textDecorationSkipInk: "none",
              textDecorationThickness: "0.85px",
              paddingBottom: "2px",
            },
            ".cm-lintRange-active": {
              backgroundColor:
                "color-mix(in oklch, var(--destructive) 12%, transparent)",
            },
            ".cm-tooltip-autocomplete": {
              backgroundColor: "var(--popover)",
              color: "var(--popover-foreground)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              boxShadow: "0 8px 24px rgba(22, 20, 18, 0.14)",
              fontSize: "13px",
            },
            ".cm-tooltip-autocomplete ul": {
              fontFamily: "var(--font-mono), ui-monospace, monospace",
            },
            ".cm-tooltip-autocomplete ul li": {
              padding: "3px 8px",
              borderRadius: "4px",
              margin: "1px 2px",
            },
            ".cm-tooltip-autocomplete ul li[aria-selected]": {
              backgroundColor: "var(--accent)",
              color: "var(--accent-foreground)",
            },
            ".cm-completionLabel": {
              fontSize: "13px",
            },
            ".cm-completionDetail": {
              fontSize: "11px",
              color: "var(--muted-foreground)",
              fontStyle: "normal",
              marginLeft: "8px",
            },
            ".cm-completionInfo": {
              backgroundColor: "var(--popover)",
              color: "var(--popover-foreground)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "6px 10px",
              fontSize: "12px",
              fontFamily: "var(--font-mono), ui-monospace, monospace",
            },
          }),
        ],
      })
      viewRef.current = view
      return () => {
        view.destroy()
        viewRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // 外部值变化同步
    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      const current = view.state.doc.toString()
      if (current === value) return
      applyingRef.current = true
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
      applyingRef.current = false
    }, [value])

    // WASM 异步编译完成后立即推送诊断标记到 CodeMirror 行号槽与波浪线
    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      const items = diagnostics ?? []
      const cmItems = toCmDiagnostics(view.state.doc.toString(), items)
      view.dispatch(cmSetDiagnostics(view.state, cmItems))
    }, [diagnostics])

    return <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden" />
  }
)
