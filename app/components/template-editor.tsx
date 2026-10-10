"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Placeholder from "@tiptap/extension-placeholder"
import TextAlign from "@tiptap/extension-text-align"
import { EditorContent, useEditor, useEditorState } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { NodeSelection } from "@tiptap/pm/state"
import { findParentNode, type Editor } from "@tiptap/core"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Columns2,
  Download,
  Heading1,
  Heading2,
  ImageIcon,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Minus,
  MoveVertical,
  Redo2,
  Rows3,
  Save,
  SeparatorHorizontal,
  Trash2,
  Undo2,
} from "lucide-react"

import {
  Column,
  Columns,
  ImageWidget,
  PageBreak,
  ResetAlignOnNewLine,
  Spacer,
  TableWidget,
  Variable,
  VariableValuesContext,
  WidgetCommands,
  selectInsertedWidget,
} from "@/components/editor/extensions"
import { Button } from "@/components/ui/button"
import {
  PageCanvas,
  PageSettingsButton,
  disableChrome,
  type PageChromeSelection,
} from "@/components/editor/page-chrome"
import {
  createWidget,
  cssFontStacks,
  extractChromeVariableKeys,
  extractVariableKeys,
  normalizeColumnWidths,
  starterTemplate,
  withNormalizedColumnWidths,
  type InsertableWidget,
  type TemplateDocument,
} from "@/lib/template"

const catalog: Array<{
  type: InsertableWidget
  label: string
  description: string
  keywords: string
  icon: typeof Bold
}> = [
  {
    type: "table",
    label: "表格",
    description: "#table()",
    keywords: "table 表格",
    icon: Rows3,
  },
  {
    type: "image",
    label: "图片",
    description: "#image()",
    keywords: "image 图片",
    icon: ImageIcon,
  },
  {
    type: "columns",
    label: "分栏",
    description: "#columns()",
    keywords: "columns column 分栏",
    icon: Columns2,
  },
  {
    type: "horizontalRule",
    label: "分隔线",
    description: "#line()",
    keywords: "line hr divider 分隔",
    icon: Minus,
  },
  {
    type: "spacer",
    label: "留白",
    description: "#v()",
    keywords: "v spacer 留白",
    icon: MoveVertical,
  },
  {
    type: "pageBreak",
    label: "分页",
    description: "#pagebreak()",
    keywords: "pagebreak page 分页",
    icon: SeparatorHorizontal,
  },
]

type CommandMenuState = {
  kind: "slash" | "variable"
  from: number
  to: number
  query: string
  left: number
  top: number
}

type VariableMenuItem = {
  key: string
  hint: string
}

export function TemplateEditor() {
  const [template, setTemplate] = useState<TemplateDocument>(starterTemplate)
  const [variables, setVariables] = useState<Record<string, string>>({
    customer: "星河科技有限公司",
    total: "合计：¥20,000",
  })
  const [exporting, setExporting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string>()
  const [previewError, setPreviewError] = useState<string>()
  const [message, setMessage] = useState("所有更改已保存")
  const [command, setCommand] = useState<CommandMenuState | null>(null)
  const [commandIndex, setCommandIndex] = useState(0)
  const [selectedChrome, setSelectedChrome] = useState<PageChromeSelection>(null)
  const commandRef = useRef<CommandMenuState | null>(null)
  const commandIndexRef = useRef(0)
  const commandCountRef = useRef(0)
  const insertRef = useRef<
    (type: InsertableWidget, range?: { from: number; to: number }) => void
  >(() => undefined)
  const insertVariableRef = useRef<
    (key: string, range: { from: number; to: number }) => void
  >(() => undefined)
  const slashItemsRef = useRef(catalog)
  const variableItemsRef = useRef<VariableMenuItem[]>([])
  const pdfUrlRef = useRef<string | null>(null)
  const previewAbortRef = useRef<AbortController | null>(null)
  const previewSeqRef = useRef(0)

  const editor = useEditor({
    immediatelyRender: false,
    content: starterTemplate.content,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
        code: false,
        blockquote: false,
        strike: false,
        dropcursor: { color: "#8b5cf6", width: 2 },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right"],
      }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading"
            ? "标题"
            : "输入正文，用 / 插入组件，用 #name 插入变量",
      }),
      Variable,
      TableWidget,
      ImageWidget,
      Spacer,
      PageBreak,
      Columns,
      Column,
      ResetAlignOnNewLine,
      WidgetCommands,
    ],
    editorProps: {
      attributes: {
        class: "template-prose outline-none",
        spellcheck: "false",
      },
      handleKeyDown: (_view, event) => {
        const current = commandRef.current
        if (!current) return false
        const count = Math.max(commandCountRef.current, 1)
        if (event.key === "ArrowDown") {
          const next = (commandIndexRef.current + 1) % count
          commandIndexRef.current = next
          setCommandIndex(next)
          return true
        }
        if (event.key === "ArrowUp") {
          const next = (commandIndexRef.current - 1 + count) % count
          commandIndexRef.current = next
          setCommandIndex(next)
          return true
        }
        if (event.key === "Escape") {
          commandRef.current = null
          setCommand(null)
          return true
        }
        if (current.kind === "slash") {
          if (event.key === "Enter") {
            const item = slashItemsRef.current[commandIndexRef.current]
            if (item) {
              insertRef.current(item.type, {
                from: current.from,
                to: current.to,
              })
              return true
            }
          }
          return false
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const key =
            commandIndexRef.current === 0 && isVariableKey(current.query)
              ? current.query
              : variableItemsRef.current[commandIndexRef.current]?.key
          if (isVariableKey(key || "")) {
            insertVariableRef.current(key || current.query, {
              from: current.from,
              to: current.to,
            })
            return true
          }
        }
        if (event.key === " " && isVariableKey(current.query)) {
          insertVariableRef.current(current.query, {
            from: current.from,
            to: current.to,
          })
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: instance }) => {
      setTemplate((current) => ({ ...current, content: instance.getJSON() }))
      setMessage("有未导出的更改")
      updateCommand(instance)
    },
    onSelectionUpdate: ({ editor: instance }) => {
      updateCommand(instance)
    },
  })

  const updateCommand = (instance: Editor) => {
    const next = getCommandState(instance)
    commandRef.current = next
    setCommand(next)
    if (!next) {
      commandIndexRef.current = 0
      setCommandIndex(0)
    }
  }

  const slashItems = useMemo(() => {
    if (!command || command.kind !== "slash") return catalog
    const query = command.query.toLowerCase()
    if (!query) return catalog
    return catalog.filter(
      (item) =>
        item.label.includes(query) ||
        item.keywords.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
    )
  }, [command])

  const variableItems = useMemo(() => {
    const existing = [
      ...extractVariableKeys(template.content),
      ...extractChromeVariableKeys(template.page),
      ...Object.keys(variables),
    ].filter((key, index, keys) => key && keys.indexOf(key) === index)
    const query = command?.kind === "variable" ? command.query : ""
    const items: VariableMenuItem[] = existing
      .filter(
        (key) => !query || key.toLowerCase().includes(query.toLowerCase())
      )
      .map((key) => ({
        key,
        hint: variables[key] || "未设置值",
      }))
    if (isVariableKey(query) && !existing.includes(query)) {
      items.unshift({ key: query, hint: "新建变量" })
    }
    return items
  }, [command, template.content, variables])

  slashItemsRef.current = slashItems
  variableItemsRef.current = variableItems
  commandCountRef.current =
    command?.kind === "variable" ? variableItems.length : slashItems.length

  useEffect(() => {
    if (commandIndex >= commandCountRef.current) {
      commandIndexRef.current = 0
      setCommandIndex(0)
    }
  }, [slashItems, variableItems, command, commandIndex])

  const editorState = useEditorState({
    editor,
    selector: ({ editor: instance }) => {
      if (!instance) return null
      return {
        canUndo: instance.can().undo(),
        canRedo: instance.can().redo(),
        bold: instance.isActive("bold"),
        italic: instance.isActive("italic"),
        heading: instance.getAttributes("heading").level as number | undefined,
        bulletList: instance.isActive("bulletList"),
        orderedList: instance.isActive("orderedList"),
        textAlign:
          (instance.getAttributes("heading").textAlign as string | undefined) ||
          (instance.getAttributes("paragraph").textAlign as
            string | undefined) ||
          "left",
        isHeading: instance.isActive("heading"),
        widget: getSelectedContext(instance),
      }
    },
  })

  const variableApi = useMemo(
    () => ({
      values: variables,
      setValue: (key: string, value: string) => {
        setVariables((current) => ({ ...current, [key]: value }))
      },
      renameKey: (from: string, to: string) => {
        if (!from || !to || from === to) return
        setVariables((current) => ({
          ...current,
          [to]: current[to] ?? current[from] ?? "",
        }))
      },
    }),
    [variables]
  )

  const insert = (
    type: InsertableWidget,
    range?: { from: number; to: number }
  ) => {
    if (!editor) return
    const content = createWidget(type)
    const chain = editor.chain().focus()
    if (range) chain.deleteRange(range)
    chain.insertContent(content).run()
    if (type !== "variable") selectInsertedWidget(editor, type)
    commandRef.current = null
    setCommand(null)
    setMessage("有未导出的更改")
  }
  insertRef.current = insert

  const insertVariable = (key: string, range: { from: number; to: number }) => {
    if (!editor || !isVariableKey(key)) return
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent({
        type: "variable",
        attrs: { key, fallback: "" },
      })
      .run()
    editor.commands.setNodeSelection(range.from)
    setVariables((current) =>
      current[key] !== undefined ? current : { ...current, [key]: "" }
    )
    commandRef.current = null
    setCommand(null)
    setMessage("有未导出的更改")
  }
  insertVariableRef.current = insertVariable

  const updateTemplate = (
    updater: (current: TemplateDocument) => TemplateDocument
  ) => {
    setTemplate(updater)
    setMessage("有未导出的更改")
  }

  const removeSelected = () => {
    if (selectedChrome) {
      updateTemplate((current) => ({
        ...current,
        page: disableChrome(current.page, selectedChrome.region),
      }))
      setSelectedChrome(null)
      return
    }
    if (!editor) return
    const { selection } = editor.state
    if (selection instanceof NodeSelection) {
      editor.chain().focus().deleteSelection().run()
    }
  }

  const exportPdf = async () => {
    if (pdfUrl && !previewError) {
      const anchor = document.createElement("a")
      anchor.href = pdfUrl
      anchor.download = `${template.name || "document"}.pdf`
      anchor.click()
      setMessage("PDF 已下载")
      return
    }
    setExporting(true)
    setMessage("正在通过 Typst 生成 PDF…")
    try {
      const blob = await requestPdf(
        {
          ...template,
          content: editor?.getJSON() ?? template.content,
        },
        variables
      )
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${template.name || "document"}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
      setMessage("PDF 已生成")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF 生成失败")
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const seq = ++previewSeqRef.current
      previewAbortRef.current?.abort()
      const controller = new AbortController()
      previewAbortRef.current = controller
      setPreviewing(true)
      void requestPdf(template, variables, controller.signal)
        .then((blob) => {
          if (seq !== previewSeqRef.current) return
          const url = URL.createObjectURL(blob)
          if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
          pdfUrlRef.current = url
          setPdfUrl(url)
          setPreviewError(undefined)
          setMessage("预览已更新")
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          if (seq !== previewSeqRef.current) return
          setPreviewError(
            error instanceof Error ? error.message : "预览生成失败"
          )
          setMessage(error instanceof Error ? error.message : "预览生成失败")
        })
        .finally(() => {
          if (seq === previewSeqRef.current) setPreviewing(false)
        })
    }, 650)
    return () => window.clearTimeout(timeout)
  }, [template, variables])

  useEffect(() => {
    return () => {
      previewAbortRef.current?.abort()
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedChrome) return
      if (event.key !== "Backspace" && event.key !== "Delete") return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return
      }
      event.preventDefault()
      updateTemplate((current) => ({
        ...current,
        page: disableChrome(current.page, selectedChrome.region),
      }))
      setSelectedChrome(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedChrome])

  return (
    <VariableValuesContext.Provider value={variableApi}>
      <main className="flex h-screen min-h-[680px] flex-col overflow-hidden bg-[#f4f6f8] text-slate-900">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-slate-950 text-sm font-bold text-white">
              P
            </div>
            <div>
              <div className="flex items-center gap-2">
                <input
                  aria-label="模板名称"
                  className="w-48 bg-transparent text-sm font-semibold outline-none"
                  value={template.name}
                  onChange={(event) =>
                    updateTemplate((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  草稿
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{message}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="撤销"
              disabled={!editorState?.canUndo}
              onClick={() => editor?.chain().focus().undo().run()}
            >
              <Undo2 />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="重做"
              disabled={!editorState?.canRedo}
              onClick={() => editor?.chain().focus().redo().run()}
            >
              <Redo2 />
            </Button>
            <span className="mx-2 h-5 w-px bg-slate-200" />
            <label className="mr-1 flex items-center gap-2 text-[11px] text-slate-500">
              尺寸
              <select
                aria-label="页面尺寸"
                value={template.page.size}
                onChange={(event) =>
                  updateTemplate((current) => ({
                    ...current,
                    page: {
                      ...current.page,
                      size: event.target
                        .value as TemplateDocument["page"]["size"],
                    },
                  }))
                }
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none"
              >
                <option value="a4">A4</option>
                <option value="a5">A5</option>
                <option value="us-letter">US Letter</option>
              </select>
            </label>
            <PageSettingsButton
              page={template.page}
              onChange={(page) =>
                updateTemplate((current) => ({ ...current, page }))
              }
            />
            <label className="mr-1 flex items-center gap-2 text-[11px] text-slate-500">
              边距
              <input
                aria-label="页边距"
                type="number"
                min={0}
                max={60}
                value={template.page.marginMm}
                onChange={(event) =>
                  updateTemplate((current) => ({
                    ...current,
                    page: {
                      ...current.page,
                      marginMm: Number(event.target.value),
                    },
                  }))
                }
                className="h-8 w-14 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none"
              />
            </label>
            <label className="mr-1 flex items-center gap-2 text-[11px] text-slate-500">
              字体
              <select
                aria-label="文档字体"
                value={template.page.fontFamily}
                onChange={(event) =>
                  updateTemplate((current) => ({
                    ...current,
                    page: {
                      ...current.page,
                      fontFamily: event.target
                        .value as TemplateDocument["page"]["fontFamily"],
                    },
                  }))
                }
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none"
              >
                <option value="sans">黑体</option>
                <option value="serif">宋体</option>
                <option value="mono">等宽</option>
              </select>
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMessage("模板已保存在当前会话")}
            >
              <Save />
              保存
            </Button>
            <Button
              size="sm"
              onClick={exportPdf}
              disabled={exporting || (!pdfUrl && previewing)}
            >
              <Download />
              {exporting ? "生成中" : "导出 PDF"}
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(420px,1fr)_minmax(360px,1fr)]">
          <section className="min-w-0 overflow-y-auto border-r border-slate-200">
            <div className="sticky top-0 z-10 border-b border-slate-200/80 bg-[#f4f6f8]/90 backdrop-blur">
              {editor && (
                <div className="relative">
                  <MarkupToolbar editor={editor} state={editorState} />
                  <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2">
                    <WidgetInspector
                      editor={editor}
                      context={editorState?.widget}
                    />
                    {(editorState?.widget?.deletable || selectedChrome) && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={removeSelected}
                        aria-label="删除组件"
                      >
                        <Trash2 className="text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <PageCanvas
              page={template.page}
              selected={selectedChrome}
              onSelect={setSelectedChrome}
              onChange={(page) =>
                updateTemplate((current) => ({ ...current, page }))
              }
            >
              <div
                style={{
                  fontFamily: cssFontStacks[template.page.fontFamily],
                }}
              >
                <EditorContent editor={editor} />
              </div>
              {command?.kind === "slash" && slashItems.length > 0 && (
                <div
                  className="fixed z-50 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
                  style={{ left: command.left, top: command.top }}
                >
                  {slashItems.map((item, index) => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.type}
                        onMouseDown={(event) => {
                          event.preventDefault()
                          insert(item.type, {
                            from: command.from,
                            to: command.to,
                          })
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                          index === commandIndex
                            ? "bg-violet-50 text-violet-800"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <Icon className="size-3.5" />
                        <span className="flex-1">{item.label}</span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {item.description}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {command?.kind === "variable" && (
                <div
                  className="fixed z-50 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
                  style={{ left: command.left, top: command.top }}
                >
                  {variableItems.length === 0 && (
                    <p className="px-3 py-2 text-[11px] text-slate-400">
                      输入变量名，例如 customer
                    </p>
                  )}
                  {variableItems.map((item, index) => (
                    <button
                      key={item.key}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        insertVariable(item.key, {
                          from: command.from,
                          to: command.to,
                        })
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                        index === commandIndex
                          ? "bg-violet-50 text-violet-800"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Braces className="size-3.5" />
                      <span className="flex-1 font-mono">{`{{${item.key}}}`}</span>
                      <span className="max-w-[7rem] truncate text-[10px] text-slate-400">
                        {item.hint}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </PageCanvas>
          </section>

          <section className="flex min-h-0 min-w-0 flex-col bg-slate-200">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3">
              <p className="text-xs font-semibold">PDF 预览</p>
              <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                {previewing && <Loader2 className="size-3 animate-spin" />}
                {previewing
                  ? "生成中"
                  : previewError
                    ? "预览失败"
                    : pdfUrl
                      ? "已同步"
                      : "等待中"}
              </p>
            </div>
            <div className="relative min-h-0 flex-1">
              {pdfUrl ? (
                <iframe
                  title="PDF 预览"
                  src={`${pdfUrl}#view=FitH`}
                  className="h-full w-full border-0 bg-slate-200"
                />
              ) : (
                <div className="grid h-full place-items-center text-xs text-slate-400">
                  {previewing
                    ? "正在生成预览…"
                    : "编辑左侧文档后将在这里显示 PDF"}
                </div>
              )}
              {previewError && (
                <div className="absolute inset-x-3 bottom-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700">
                  {previewError}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </VariableValuesContext.Provider>
  )
}

function MarkupToolbar({
  editor,
  state,
}: {
  editor: Editor
  state: {
    bold: boolean
    italic: boolean
    heading?: number
    bulletList: boolean
    orderedList: boolean
    textAlign: string
    isHeading: boolean
  } | null
}) {
  const buttonClass = (active: boolean) =>
    `grid size-8 place-items-center rounded-md text-slate-500 ${
      active ? "bg-slate-900 text-white" : "hover:bg-slate-100"
    }`

  return (
    <div className="flex items-center justify-center gap-1 px-3 py-1.5">
      <button
        type="button"
        className={buttonClass(Boolean(state?.bold))}
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-label="加粗"
      >
        <Bold className="size-3.5" />
      </button>
      <button
        type="button"
        className={buttonClass(Boolean(state?.italic))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-label="斜体"
      >
        <Italic className="size-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-slate-200" />
      <button
        type="button"
        className={buttonClass(
          Boolean(state?.isHeading && state.heading === 1)
        )}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        aria-label="一级标题"
      >
        <Heading1 className="size-3.5" />
      </button>
      <button
        type="button"
        className={buttonClass(
          Boolean(state?.isHeading && state.heading === 2)
        )}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        aria-label="二级标题"
      >
        <Heading2 className="size-3.5" />
      </button>
      <button
        type="button"
        className={buttonClass(Boolean(state?.bulletList))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        aria-label="无序列表"
      >
        <List className="size-3.5" />
      </button>
      <button
        type="button"
        className={buttonClass(Boolean(state?.orderedList))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        aria-label="有序列表"
      >
        <ListOrdered className="size-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-slate-200" />
      {(["left", "center", "right"] as const).map((align) => {
        const Icon =
          align === "left"
            ? AlignLeft
            : align === "center"
              ? AlignCenter
              : AlignRight
        return (
          <button
            key={align}
            type="button"
            className={buttonClass(state?.textAlign === align)}
            onClick={() => editor.chain().focus().setTextAlign(align).run()}
            aria-label={align}
          >
            <Icon className="size-3.5" />
          </button>
        )
      })}
    </div>
  )
}

function WidgetInspector({
  editor,
  context,
}: {
  editor: Editor
  context: SelectedContext | null | undefined
}) {
  if (context?.type === "spacer") {
    const height = Number(context.attrs.heightMm || 8)
    return (
      <label className="flex items-center gap-2 text-[11px] text-slate-500">
        {height} mm
        <input
          type="range"
          min="1"
          max="60"
          value={height}
          onChange={(event) =>
            editor
              .chain()
              .focus()
              .updateAttributes("spacer", {
                heightMm: Number(event.target.value),
              })
              .run()
          }
          className="w-24 accent-slate-900"
        />
      </label>
    )
  }

  if (context?.type === "image") {
    const width = Number(context.attrs.widthPercent || 100)
    return (
      <label className="flex items-center gap-2 text-[11px] text-slate-500">
        {width}%
        <input
          type="range"
          min="5"
          max="100"
          value={width}
          onChange={(event) =>
            editor
              .chain()
              .focus()
              .updateAttributes("image", {
                widthPercent: Number(event.target.value),
              })
              .run()
          }
          className="w-24 accent-slate-900"
        />
      </label>
    )
  }

  if (context?.type === "columns") {
    const gap = Number(context.attrs.gapMm || 8)
    const widths = normalizeColumnWidths(
      context.attrs.widths,
      context.childCount || 2
    )
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-slate-400">
          {widths.map((width) => `${Math.round(width)}%`).join(" / ")}
        </span>
        <div className="flex rounded-md bg-slate-100 p-0.5">
          {[2, 3].map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => editor.chain().focus().setColumnCount(count).run()}
              className={`rounded px-2 py-1 text-[10px] ${
                context.childCount === count
                  ? "bg-white font-medium shadow-sm"
                  : "text-slate-400"
              }`}
            >
              {count} 栏
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[11px] text-slate-500">
          {gap} mm
          <input
            type="range"
            min="2"
            max="24"
            value={gap}
            onChange={(event) =>
              editor
                .chain()
                .focus()
                .updateAttributes("columns", {
                  gapMm: Number(event.target.value),
                })
                .run()
            }
            className="w-20 accent-slate-900"
          />
        </label>
      </div>
    )
  }

  return null
}

type SelectedContext = {
  type: string
  attrs: Record<string, unknown>
  childCount?: number
  deletable: boolean
}

function getSelectedContext(editor: Editor): SelectedContext | null {
  const { selection } = editor.state
  if (selection instanceof NodeSelection) {
    return {
      type: selection.node.type.name,
      attrs: selection.node.attrs as Record<string, unknown>,
      childCount: selection.node.childCount,
      deletable: true,
    }
  }
  const columns = findParentNode((node) => node.type.name === "columns")(
    selection
  )
  if (columns) {
    return {
      type: "columns",
      attrs: columns.node.attrs as Record<string, unknown>,
      childCount: columns.node.childCount,
      deletable: false,
    }
  }
  if (editor.isActive("variable")) {
    return {
      type: "variable",
      attrs: editor.getAttributes("variable"),
      deletable: true,
    }
  }
  if (editor.isActive("heading")) {
    return {
      type: "heading",
      attrs: editor.getAttributes("heading"),
      deletable: false,
    }
  }
  if (editor.isActive("paragraph")) {
    return {
      type: "paragraph",
      attrs: editor.getAttributes("paragraph"),
      deletable: false,
    }
  }
  return null
}

function isVariableKey(value: string) {
  return /^[A-Za-z][\w.-]*$/.test(value)
}

function getCommandState(editor: Editor): CommandMenuState | null {
  const { $from } = editor.state.selection
  if (
    $from.parent.type.name !== "paragraph" &&
    $from.parent.type.name !== "heading"
  ) {
    return null
  }
  const textBefore = $from.parent.textBetween(
    0,
    $from.parentOffset,
    undefined,
    "\0"
  )
  const coords = editor.view.coordsAtPos($from.pos)
  const position = {
    left: coords.left,
    top: coords.bottom + 8,
    to: $from.pos,
  }

  const slash = textBefore.match(/\/([^\s/]*)$/)
  if (slash) {
    return {
      kind: "slash",
      from: $from.pos - slash[0].length,
      query: slash[1] || "",
      ...position,
    }
  }

  if (/^#{2,6}$/.test(textBefore)) return null

  const hash = textBefore.match(/#([A-Za-z][\w.-]*)?$/)
  if (!hash) return null
  return {
    kind: "variable",
    from: $from.pos - hash[0].length,
    query: hash[1] || "",
    ...position,
  }
}

async function requestPdf(
  template: TemplateDocument,
  variables: Record<string, string>,
  signal?: AbortSignal
) {
  const response = await fetch("/api/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      template: {
        ...template,
        content: withNormalizedColumnWidths(template.content),
      },
      variables,
    }),
    signal,
  })
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      message?: string
    } | null
    throw new Error(error?.message || "PDF 渲染服务不可用")
  }
  const buffer = await response.arrayBuffer()
  return new Blob([buffer], { type: "application/pdf" })
}
