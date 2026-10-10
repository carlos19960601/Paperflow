"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  Extension,
  InputRule,
  Node,
  findParentNode,
  mergeAttributes,
  nodeInputRule,
  type Editor,
} from "@tiptap/core"
import { NodeSelection, Plugin, type Selection } from "@tiptap/pm/state"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { ImageIcon } from "lucide-react"

import {
  createWidget,
  normalizeColumnWidths,
  type InsertableWidget,
} from "@/lib/template"

type VariableValuesApi = {
  values: Record<string, string>
  setValue: (key: string, value: string) => void
  renameKey: (from: string, to: string) => void
}

export const VariableValuesContext = createContext<VariableValuesApi>({
  values: {},
  setValue: () => undefined,
  renameKey: () => undefined,
})

function useVariableValues() {
  return useContext(VariableValuesContext)
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columns: {
      setColumnCount: (count: number) => ReturnType
    }
    widgetSelection: {
      selectInsertedWidget: (type: string) => ReturnType
    }
  }
}

export const BLOCK_WIDGET_TYPES = [
  "columns",
  "table",
  "image",
  "spacer",
  "pageBreak",
  "horizontalRule",
] as const

function isWidgetEditTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest(
      "input, textarea, select, button, [data-widget-ui], .template-column, .template-col-resizer"
    )
  )
}

export function selectInsertedWidget(editor: Editor, type: string) {
  return editor.commands.selectInsertedWidget(type)
}

export const Variable = Node.create({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      key: { default: "variable" },
      fallback: { default: "" },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-type="variable"]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "variable" }),
      `{{${node.attrs.key}}}`,
    ]
  },
  addNodeView() {
    return ReactNodeViewRenderer(VariableView, {
      as: "span",
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement
        return Boolean(target.closest("[data-widget-ui]"))
      },
    })
  },
  addInputRules() {
    return [
      nodeInputRule({
        find: /\{\{\s*([A-Za-z][\w.-]*)\s*\}\}$/,
        type: this.type,
        getAttributes: (match) => ({
          key: match[1],
          fallback: "",
        }),
      }),
      nodeInputRule({
        find: /#([A-Za-z][\w.-]*)\s$/,
        type: this.type,
        getAttributes: (match) => ({
          key: match[1],
          fallback: "",
        }),
      }),
    ]
  },
})

function VariableView({
  editor,
  node,
  selected,
  updateAttributes,
}: ReactNodeViewProps) {
  const { values, setValue, renameKey } = useVariableValues()
  const chipRef = useRef<HTMLSpanElement>(null)
  const valueRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const key = String(node.attrs.key || "")
  const value = values[key] || ""

  useEffect(() => {
    if (!selected) {
      setPos(null)
      return
    }
    const place = () => {
      const rect = chipRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = 240
      const left = Math.min(rect.left, window.innerWidth - width - 12)
      const top = rect.bottom + 8
      setPos({ left: Math.max(12, left), top })
    }
    place()
    const close = () => {
      editor.commands.setTextSelection(editor.state.selection.to)
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (
        target.closest("[data-variable-popover]") ||
        chipRef.current?.contains(target)
      ) {
        return
      }
      close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    const frame = window.requestAnimationFrame(() => valueRef.current?.focus())
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
      window.cancelAnimationFrame(frame)
    }
  }, [editor, selected])

  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        ref={chipRef}
        title={value || "点击设置变量值"}
        className={`mx-0.5 inline-flex cursor-pointer items-baseline rounded-md border px-1.5 py-0.5 font-mono text-[12px] leading-none ${
          selected
            ? "border-violet-400 bg-violet-100 text-violet-800"
            : "border-violet-200 bg-violet-50 text-violet-700"
        }`}
      >
        {`{{${key || "name"}}}`}
      </span>
      {selected && pos
        ? createPortal(
            <div
              data-widget-ui
              data-variable-popover
              className="fixed z-50 w-60 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
              style={{ left: pos.left, top: pos.top }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium text-slate-500">
                  变量名
                </span>
                <input
                  value={key}
                  onChange={(event) => {
                    const next = event.target.value.replace(/[^\w.-]/g, "")
                    if (next !== key) {
                      if (key && next) renameKey(key, next)
                      updateAttributes({ key: next })
                    }
                  }}
                  className="h-8 w-full rounded-lg border border-slate-200 px-2 font-mono text-xs outline-none focus:border-violet-400"
                />
              </label>
              <label className="mt-2 block">
                <span className="mb-1 block text-[10px] font-medium text-slate-500">
                  值
                </span>
                <input
                  ref={valueRef}
                  value={value}
                  placeholder="预览时使用的值"
                  onChange={(event) => {
                    if (!key) return
                    setValue(key, event.target.value)
                  }}
                  className="h-8 w-full rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-violet-400"
                />
              </label>
            </div>,
            document.body
          )
        : null}
    </NodeViewWrapper>
  )
}

export const TableWidget = Node.create({
  name: "table",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      headers: { default: ["列 1", "列 2"] },
      rows: { default: [["内容", "内容"]] },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="template-table"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "template-table" }),
    ]
  },
  addNodeView() {
    return ReactNodeViewRenderer(TableView, {
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement
        return Boolean(target.closest("[data-widget-ui]"))
      },
    })
  },
})

function TableView({ node, selected, updateAttributes }: ReactNodeViewProps) {
  const headers = asStringArray(node.attrs.headers)
  const rows = asStringMatrix(node.attrs.rows, headers.length)

  const setHeader = (index: number, value: string) => {
    const next = [...headers]
    next[index] = value
    updateAttributes({ headers: next })
  }

  const setCell = (rowIndex: number, cellIndex: number, value: string) => {
    const next = rows.map((row) => [...row])
    next[rowIndex][cellIndex] = value
    updateAttributes({ rows: next })
  }

  return (
    <NodeViewWrapper>
      <div
        className={`overflow-hidden rounded-lg border ${
          selected
            ? "border-violet-400 ring-2 ring-violet-100"
            : "border-slate-200"
        }`}
      >
        <div className="widget-chrome px-2 py-1 text-[9px] tracking-[0.12em] text-stone-400">
          表格
        </div>
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-slate-100">
            <tr>
              {headers.map((cell, index) => (
                <th key={index} className="border border-slate-200 p-0">
                  <input
                    data-widget-ui
                    value={cell}
                    onChange={(event) => setHeader(index, event.target.value)}
                    className="w-full bg-transparent px-2 py-2 font-semibold outline-none"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="border border-slate-200 p-0">
                    <input
                      data-widget-ui
                      value={cell}
                      onChange={(event) =>
                        setCell(rowIndex, cellIndex, event.target.value)
                      }
                      className="w-full px-2 py-2 outline-none"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-1 border-t border-slate-100 bg-slate-50 px-2 py-1">
          <button
            type="button"
            data-widget-ui
            className="rounded px-2 py-1 text-[10px] text-slate-500 hover:bg-white"
            onClick={() =>
              updateAttributes({
                rows: [...rows, headers.map(() => "")],
              })
            }
          >
            + 行
          </button>
          <button
            type="button"
            data-widget-ui
            className="rounded px-2 py-1 text-[10px] text-slate-500 hover:bg-white"
            onClick={() =>
              updateAttributes({
                headers: [...headers, `列 ${headers.length + 1}`],
                rows: rows.map((row) => [...row, ""]),
              })
            }
          >
            + 列
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  )
}

export const ImageWidget = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: "" },
      widthPercent: { default: 100 },
      caption: { default: "" },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="template-image"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "template-image" }),
    ]
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView, {
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement
        return Boolean(target.closest("[data-widget-ui]"))
      },
    })
  },
})

function ImageView({ node, selected, updateAttributes }: ReactNodeViewProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const src = String(node.attrs.src || "")
  const caption = String(node.attrs.caption || "")
  const width = Number(node.attrs.widthPercent || 100)

  return (
    <NodeViewWrapper>
      <figure
        className={`rounded-lg border p-3 text-center ${
          selected
            ? "border-violet-400 ring-2 ring-violet-100"
            : "border-transparent"
        }`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={caption}
            className="mx-auto max-h-80 object-contain"
            style={{ width: `${width}%` }}
          />
        ) : (
          <button
            type="button"
            data-widget-ui
            onClick={() => inputRef.current?.click()}
            className="grid h-32 w-full place-items-center rounded-lg bg-slate-100 text-xs text-slate-400"
          >
            <ImageIcon className="mb-1 size-5" />
            点击上传图片
          </button>
        )}
        <input
          ref={inputRef}
          data-widget-ui
          type="file"
          accept="image/png,image/jpeg,image/gif,image/svg+xml"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () =>
              updateAttributes({ src: String(reader.result) })
            reader.readAsDataURL(file)
          }}
        />
        {src && (
          <input
            data-widget-ui
            value={caption}
            placeholder="图片说明"
            onChange={(event) =>
              updateAttributes({ caption: event.target.value })
            }
            className="mt-2 w-full bg-transparent text-center text-[10px] text-slate-400 outline-none"
          />
        )}
      </figure>
    </NodeViewWrapper>
  )
}

export const Spacer = Node.create({
  name: "spacer",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { heightMm: { default: 8 } }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="spacer"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "spacer" })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(SpacerView)
  },
})

function SpacerView({ node, selected }: ReactNodeViewProps) {
  const height = Number(node.attrs.heightMm || 8)
  return (
    <NodeViewWrapper>
      <div
        className={`grid place-items-center border-y border-dashed text-[9px] text-slate-300 ${
          selected ? "border-violet-400 bg-violet-50/40" : "border-slate-200"
        }`}
        style={{ height: `${height * 3}px` }}
      >
        {height} mm
      </div>
    </NodeViewWrapper>
  )
}

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "page-break" }),
    ]
  },
  addNodeView() {
    return ReactNodeViewRenderer(PageBreakView)
  },
})

function PageBreakView({ selected }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper>
      <div
        className={`flex items-center gap-2 py-1 text-[10px] ${
          selected ? "text-violet-500" : "text-slate-400"
        }`}
      >
        <span className="h-px flex-1 border-t border-dashed border-current" />
        分页
        <span className="h-px flex-1 border-t border-dashed border-current" />
      </div>
    </NodeViewWrapper>
  )
}

export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column{2,3}",
  isolating: true,
  defining: true,
  selectable: true,
  addAttributes() {
    return {
      gapMm: {
        default: 8,
        parseHTML: (element) =>
          Number(element.getAttribute("data-gap-mm") || 8),
        renderHTML: (attributes) => ({ "data-gap-mm": attributes.gapMm }),
      },
      widths: {
        default: [50, 50],
        parseHTML: (element) => {
          const raw = element.getAttribute("data-widths")
          if (!raw) return [50, 50]
          try {
            return normalizeColumnWidths(JSON.parse(raw), 2)
          } catch {
            return [50, 50]
          }
        },
        renderHTML: (attributes) => ({
          "data-widths": JSON.stringify(attributes.widths),
        }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const widths = normalizeColumnWidths(node.attrs.widths, node.childCount)
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "columns",
        class: "template-columns",
        style: columnTrackStyle(node.attrs.gapMm, widths),
      }),
      0,
    ]
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const shell = document.createElement("div")
      shell.className = "template-columns-shell"
      const contentDOM = document.createElement("div")
      contentDOM.dataset.type = "columns"
      contentDOM.className = "template-columns"
      shell.append(contentDOM)

      let current = node
      let resizing = false
      const handles: HTMLElement[] = []
      let session: ColumnResizeSession | null = null

      const apply = (next: typeof node) => {
        current = next
        if (resizing) return
        const widths = normalizeColumnWidths(next.attrs.widths, next.childCount)
        contentDOM.style.cssText = columnTrackStyle(next.attrs.gapMm, widths)
        syncHandles(next.childCount)
      }

      const syncHandles = (count: number) => {
        const gaps = Math.max(0, count - 1)
        while (handles.length < gaps) {
          const handle = document.createElement("div")
          handle.className = "template-col-resizer"
          handle.contentEditable = "false"
          handle.title = "拖拽调整栏宽"
          handle.dataset.colResize = String(handles.length)
          bindHandle(handle)
          shell.append(handle)
          handles.push(handle)
        }
        handles.forEach((handle, index) => {
          handle.dataset.colResize = String(index)
          handle.hidden = index >= gaps
        })
        requestAnimationFrame(positionHandles)
      }

      const positionHandles = () => {
        const columns = contentDOM.querySelectorAll(":scope > .template-column")
        const gap = Number.parseFloat(getComputedStyle(contentDOM).gap) || 24
        const originLeft = contentDOM.offsetLeft
        const originTop = contentDOM.offsetTop
        handles.forEach((handle, index) => {
          const column = columns[index]
          if (!(column instanceof HTMLElement) || index >= columns.length - 1) {
            return
          }
          handle.style.left = `${originLeft + column.offsetLeft + column.offsetWidth + gap / 2}px`
          handle.style.top = `${originTop + column.offsetTop}px`
          handle.style.height = `${Math.max(column.offsetHeight, 48)}px`
        })
      }

      const finishResize = () => {
        if (!session) return
        const widths = session.latest
        session.parent.classList.remove("is-resizing")
        document.body.classList.remove("is-col-resizing")
        window.removeEventListener("pointermove", onPointerMove, true)
        window.removeEventListener("pointerup", onPointerUp, true)
        session = null
        resizing = false
        const pos = columnsNodePos(editor, getPos)
        if (pos == null) {
          apply(current)
          return
        }
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, {
            ...current.attrs,
            widths,
          }),
        )
      }

      const onPointerMove = (event: PointerEvent) => {
        if (!session) return
        const next = resizeColumnWidths(session, event.clientX)
        session.latest = next
        contentDOM.style.cssText = columnTrackStyle(session.gapMm, next)
        positionHandles()
      }

      const onPointerUp = () => {
        finishResize()
      }

      const bindHandle = (handle: HTMLElement) => {
        handle.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.stopPropagation()
          const index = Number(handle.dataset.colResize)
          if (!Number.isFinite(index) || index < 0) return
          const widths = normalizeColumnWidths(
            current.attrs.widths,
            current.childCount,
          )
          if (index >= widths.length - 1) return
          resizing = true
          session = {
            index,
            startX: event.clientX,
            start: widths,
            latest: widths,
            usable: Math.max(contentDOM.clientWidth, 1),
            gapMm: Number(current.attrs.gapMm || 8),
            parent: contentDOM,
          }
          contentDOM.classList.add("is-resizing")
          document.body.classList.add("is-col-resizing")
          handle.setPointerCapture(event.pointerId)
          window.addEventListener("pointermove", onPointerMove, true)
          window.addEventListener("pointerup", onPointerUp, true)
        })
      }

      const onChromeMouseDown = (event: MouseEvent) => {
        if (event.button !== 0 || resizing || session) return
        if (isWidgetEditTarget(event.target)) return
        event.preventDefault()
        const pos = columnsNodePos(editor, getPos)
        if (pos == null) return
        editor.chain().focus().setNodeSelection(pos).run()
      }
      shell.addEventListener("mousedown", onChromeMouseDown)

      apply(node)

      return {
        dom: shell,
        contentDOM,
        stopEvent: (event) => {
          const target = event.target as HTMLElement
          return Boolean(target.closest("[data-col-resize], .template-col-resizer"))
        },
        ignoreMutation: (mutation) => {
          const target = mutation.target as HTMLElement
          return (
            target === shell ||
            target === contentDOM ||
            Boolean(target.closest(".template-col-resizer"))
          )
        },
        update(updated) {
          if (updated.type.name !== "columns") return false
          apply(updated)
          return true
        },
        destroy() {
          shell.removeEventListener("mousedown", onChromeMouseDown)
          window.removeEventListener("pointermove", onPointerMove, true)
          window.removeEventListener("pointerup", onPointerUp, true)
          document.body.classList.remove("is-col-resizing")
        },
      }
    }
  },
  addKeyboardShortcuts() {
    return {
      ArrowRight: ({ editor }) => moveAcrossColumns(editor, 1),
      ArrowLeft: ({ editor }) => moveAcrossColumns(editor, -1),
    }
  },
  addCommands() {
    return {
      setColumnCount:
        (count: number) =>
        ({ tr, state, dispatch }) => {
          const found = findColumnsContext(state.selection)
          if (!found || count < 2 || count > 3) return false
          const columns = []
          for (let index = 0; index < count; index += 1) {
            if (index < found.node.childCount) {
              columns.push(found.node.child(index))
            } else {
              const filled = state.schema.nodes.column.createAndFill()
              if (filled) columns.push(filled)
            }
          }
          const next = state.schema.nodes.columns.create(
            {
              ...found.node.attrs,
              widths: normalizeColumnWidths(found.node.attrs.widths, count),
            },
            columns
          )
          if (dispatch) {
            dispatch(
              tr.replaceWith(found.pos, found.pos + found.node.nodeSize, next)
            )
          }
          return true
        },
    }
  },
})

export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,
  selectable: false,
  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }]
  },
  renderHTML() {
    return ["div", { "data-type": "column", class: "template-column" }, 0]
  },
  addNodeView() {
    return () => {
      const dom = document.createElement("div")
      dom.dataset.type = "column"
      dom.className = "template-column"
      return { dom, contentDOM: dom }
    }
  },
})

type ColumnResizeSession = {
  index: number
  startX: number
  start: number[]
  latest: number[]
  usable: number
  gapMm: number
  parent: HTMLElement
}

function findColumnsContext(selection: Selection) {
  if (
    selection instanceof NodeSelection &&
    selection.node.type.name === "columns"
  ) {
    return { node: selection.node, pos: selection.from }
  }
  return findParentNode((node) => node.type.name === "columns")(selection)
}

function columnsNodePos(editor: Editor, getPos: () => unknown) {
  const pos = getPos()
  if (typeof pos !== "number") return null
  const $pos = editor.state.doc.resolve(pos)
  if ($pos.nodeAfter?.type.name === "columns") return pos
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "columns") {
      return $pos.before(depth)
    }
  }
  return null
}

function columnTrackStyle(gapMm: unknown, widths: number[]) {
  const tracks = widths.map((width) => `minmax(0, ${width}fr)`).join(" ")
  return `--col-gap: ${Number(gapMm || 8) * 3}px; --col-tracks: ${tracks}`
}

function resizeColumnWidths(session: ColumnResizeSession, clientX: number) {
  const left = session.start[session.index] ?? 50
  const right = session.start[session.index + 1] ?? 50
  const pair = left + right
  const min = Math.min(16, pair / 2)
  const delta = ((clientX - session.startX) / session.usable) * 100
  const nextLeft = Math.min(pair - min, Math.max(min, left + delta))
  const next = [...session.start]
  next[session.index] = Math.round(nextLeft * 10) / 10
  next[session.index + 1] = Math.round((pair - nextLeft) * 10) / 10
  return next
}

function moveAcrossColumns(editor: Editor, direction: 1 | -1) {
  const { selection } = editor.state
  if (!selection.empty) return false
  const { $from } = selection
  const column = findParentNode((node) => node.type.name === "column")(
    selection
  )
  const columns = findParentNode((node) => node.type.name === "columns")(
    selection
  )
  if (!column || !columns) return false

  const childIndex = $from.index(column.depth)
  const atBlockEdge =
    direction === 1
      ? $from.parentOffset === $from.parent.content.size
      : $from.parentOffset === 0
  const atColumnEdge =
    direction === 1
      ? childIndex === column.node.childCount - 1
      : childIndex === 0
  if (!atBlockEdge || !atColumnEdge) return false

  let currentIndex = -1
  let offset = columns.start
  for (let index = 0; index < columns.node.childCount; index += 1) {
    if (offset === column.pos) {
      currentIndex = index
      break
    }
    offset += columns.node.child(index).nodeSize
  }
  const nextIndex = currentIndex + direction
  if (nextIndex < 0 || nextIndex >= columns.node.childCount) return false

  let nextPos = columns.start
  for (let index = 0; index < nextIndex; index += 1) {
    nextPos += columns.node.child(index).nodeSize
  }
  const nextColumn = columns.node.child(nextIndex)
  return editor
    .chain()
    .setTextSelection(
      direction === 1 ? nextPos + 1 : nextPos + nextColumn.nodeSize - 1
    )
    .run()
}

const widgetByCommand: Record<string, InsertableWidget> = {
  table: "table",
  columns: "columns",
  column: "columns",
  image: "image",
  pagebreak: "pageBreak",
  page: "pageBreak",
  line: "horizontalRule",
  v: "spacer",
  spacer: "spacer",
}

export const ResetAlignOnNewLine = Extension.create({
  name: "resetAlignOnNewLine",
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (editor.isActive("bulletList") || editor.isActive("orderedList")) {
          return false
        }
        const { $from } = editor.state.selection
        if (
          $from.parent.type.name !== "paragraph" &&
          $from.parent.type.name !== "heading"
        ) {
          return false
        }
        const align = $from.parent.attrs.textAlign as string | null
        if (!align || align === "left") return false
        if (!editor.commands.splitBlock()) return false
        editor.commands.unsetTextAlign()
        return true
      },
    }
  },
})

export const WidgetCommands = Extension.create({
  name: "widgetCommands",
  addCommands() {
    return {
      selectInsertedWidget:
        (type: string) =>
        ({ state, dispatch }) => {
          const { selection, doc } = state
          if (
            selection instanceof NodeSelection &&
            selection.node.type.name === type
          ) {
            return true
          }
          const parent = findParentNode((node) => node.type.name === type)(
            selection
          )
          if (parent) {
            if (dispatch) {
              dispatch(
                state.tr.setSelection(NodeSelection.create(doc, parent.pos))
              )
            }
            return true
          }
          const $from = selection.$from
          const before = $from.nodeBefore
          if (before?.type.name === type) {
            if (dispatch) {
              dispatch(
                state.tr.setSelection(
                  NodeSelection.create(doc, $from.pos - before.nodeSize)
                )
              )
            }
            return true
          }
          const after = $from.nodeAfter
          if (after?.type.name === type) {
            if (dispatch) {
              dispatch(state.tr.setSelection(NodeSelection.create(doc, $from.pos)))
            }
            return true
          }
          let found: number | null = null
          const from = Math.max(0, selection.from - 8)
          const to = Math.min(doc.content.size, selection.to + 8)
          doc.nodesBetween(from, to, (node, pos) => {
            if (found != null) return false
            if (node.type.name === type) {
              found = pos
              return false
            }
            return true
          })
          if (found == null) return false
          if (dispatch) {
            dispatch(state.tr.setSelection(NodeSelection.create(doc, found)))
          }
          return true
        },
    }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClickOn(view, _pos, node, nodePos, event) {
            if (node.type.name !== "columns") return false
            if (isWidgetEditTarget(event.target)) return false
            view.dispatch(
              view.state.tr.setSelection(
                NodeSelection.create(view.state.doc, nodePos)
              )
            )
            return true
          },
          handleKeyDown(view, event) {
            if (event.key !== "Delete" && event.key !== "Backspace") {
              return false
            }
            const { selection } = view.state
            if (!(selection instanceof NodeSelection)) return false
            if (
              !BLOCK_WIDGET_TYPES.includes(
                selection.node.type.name as (typeof BLOCK_WIDGET_TYPES)[number]
              ) &&
              selection.node.type.name !== "variable"
            ) {
              return false
            }
            view.dispatch(view.state.tr.deleteSelection())
            return true
          },
        },
      }),
    ]
  },
  addInputRules() {
    return [
      new InputRule({
        find: /^#(table|columns|column|image|pagebreak|page|line|v|spacer)\s$/,
        handler: ({ range, match, commands }) => {
          const type = widgetByCommand[match[1] || ""]
          if (!type) return null
          commands.deleteRange(range)
          commands.insertContent(createWidget(type))
          commands.selectInsertedWidget(type)
        },
      }),
    ]
  },
})

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item ?? "")) : []
}

function asStringMatrix(value: unknown, columns: number) {
  const rows = Array.isArray(value) ? value : []
  return rows.map((row) => {
    const cells = Array.isArray(row)
      ? row.map((cell) => String(cell ?? ""))
      : []
    return Array.from(
      { length: Math.max(columns, 1) },
      (_, index) => cells[index] || ""
    )
  })
}
