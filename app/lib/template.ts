import type { JSONContent } from "@tiptap/core"

export type TextAlign = "left" | "center" | "right"
export type PageSize = "a4" | "a5" | "us-letter"
export type FontFamily = "sans" | "serif" | "mono"
export type ChromeSlot = "left" | "center" | "right"
export type BackgroundKind = "none" | "color" | "image" | "watermark"

export interface PageChrome {
  enabled: boolean
  showOnFirstPage: boolean
  left: string
  center: string
  right: string
}

export interface PageHeader extends PageChrome {
  logoSrc?: string
}

export interface PageBackground {
  kind: BackgroundKind
  color: string
  imageSrc?: string
  opacity: number
  watermarkText: string
}

export interface PageSettings {
  size: PageSize
  marginMm: number
  fontFamily: FontFamily
  header: PageHeader
  footer: PageChrome
  background: PageBackground
}

export interface TemplateDocument {
  name: string
  page: PageSettings
  content: JSONContent
}

export const defaultPageHeader: PageHeader = {
  enabled: false,
  showOnFirstPage: true,
  left: "",
  center: "",
  right: "",
}

export const defaultPageFooter: PageChrome = {
  enabled: false,
  showOnFirstPage: true,
  left: "",
  center: "",
  right: "",
}

export const defaultPageBackground: PageBackground = {
  kind: "none",
  color: "#f8fafc",
  opacity: 0.12,
  watermarkText: "草稿",
}

export function createEnabledHeader(): PageHeader {
  return { ...defaultPageHeader, enabled: true }
}

export function createEnabledFooter(): PageChrome {
  return {
    ...defaultPageFooter,
    enabled: true,
    center: "第 {{page}} / {{pages}} 页",
  }
}

export type InsertableWidget =
  | "variable"
  | "table"
  | "image"
  | "columns"
  | "horizontalRule"
  | "spacer"
  | "pageBreak"

export const starterTemplate: TemplateDocument = {
  name: "销售报价单",
  page: {
    size: "a4",
    marginMm: 18,
    fontFamily: "sans",
    header: defaultPageHeader,
    footer: createEnabledFooter(),
    background: defaultPageBackground,
  },
  content: {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1, textAlign: "center" },
        content: [{ type: "text", text: "销售报价单" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "感谢您选择 Paperflow，以下是本次项目的报价详情。",
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "客户：" },
          {
            type: "variable",
            attrs: { key: "customer", fallback: "客户名称" },
          },
        ],
      },
      {
        type: "table",
        attrs: {
          headers: ["项目", "数量", "金额"],
          rows: [
            ["设计服务", "1", "¥8,000"],
            ["实施服务", "1", "¥12,000"],
          ],
        },
      },
      { type: "horizontalRule" },
      {
        type: "paragraph",
        attrs: { textAlign: "right" },
        content: [
          {
            type: "variable",
            attrs: { key: "total", fallback: "合计金额" },
          },
        ],
      },
    ],
  },
}

export function createWidget(type: InsertableWidget): JSONContent {
  switch (type) {
    case "variable":
      return {
        type: "variable",
        attrs: { key: "variable", fallback: "变量默认值" },
      }
    case "table":
      return {
        type: "table",
        attrs: {
          headers: ["列 1", "列 2"],
          rows: [["内容", "内容"]],
        },
      }
    case "image":
      return {
        type: "image",
        attrs: { src: "", widthPercent: 100, caption: "" },
      }
    case "columns":
      return {
        type: "columns",
        attrs: { gapMm: 8, widths: [50, 50] },
        content: [
          { type: "column", content: [{ type: "paragraph" }] },
          { type: "column", content: [{ type: "paragraph" }] },
        ],
      }
    case "horizontalRule":
      return { type: "horizontalRule" }
    case "spacer":
      return { type: "spacer", attrs: { heightMm: 8 } }
    case "pageBreak":
      return { type: "pageBreak" }
  }
}

export function normalizeColumnWidths(value: unknown, count: number) {
  const size = Math.max(2, Math.min(3, count || 2))
  const raw = Array.isArray(value)
    ? value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    : []
  if (raw.length !== size) {
    return Array.from(
      { length: size },
      () => Math.round((100 / size) * 10) / 10,
    )
  }
  const sum = raw.reduce((total, item) => total + item, 0)
  return raw.map((item) => Math.round((item / sum) * 1000) / 10)
}

export function withNormalizedColumnWidths(content: JSONContent): JSONContent {
  const next = content.content?.map(withNormalizedColumnWidths)
  if (content.type !== "columns") {
    return next ? { ...content, content: next } : content
  }
  return {
    ...content,
    attrs: {
      ...content.attrs,
      widths: normalizeColumnWidths(
        content.attrs?.widths,
        content.content?.length || 2,
      ),
    },
    content: next,
  }
}

const chromeTokenPattern = /\{\{([A-Za-z][\w.-]*)\}\}/g
const pageNumberTokens = new Set(["page", "pages"])

export function extractVariableKeys(content: JSONContent | undefined) {
  const keys: string[] = []
  walkContent(content, (node) => {
    if (node.type === "variable") {
      const key = String(node.attrs?.key || "").trim()
      if (key) keys.push(key)
    }
  })
  return [...new Set(keys)]
}

export function extractChromeVariableKeys(page: PageSettings) {
  const keys: string[] = []
  for (const text of chromeSlotTexts(page)) {
    for (const match of text.matchAll(chromeTokenPattern)) {
      const key = match[1]
      if (key && !pageNumberTokens.has(key)) keys.push(key)
    }
  }
  return [...new Set(keys)]
}

export function chromeSlotTexts(page: PageSettings) {
  return [
    page.header.left,
    page.header.center,
    page.header.right,
    page.footer.left,
    page.footer.center,
    page.footer.right,
  ]
}

export function insertChromeToken(text: string, token: "{{page}}" | "{{pages}}") {
  return `${text}${text && !text.endsWith(" ") ? " " : ""}${token}`
}

export function resolveVariable(
  key: string,
  fallback: string,
  variables: Record<string, string>
) {
  return variables[key] || fallback
}

export const cssFontStacks: Record<
  TemplateDocument["page"]["fontFamily"],
  string
> = {
  sans: 'Inter, "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif',
  serif:
    '"Songti SC", "Hiragino Mincho ProN", "Noto Serif CJK SC", SimSun, serif',
  mono: '"DejaVu Sans Mono", "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", monospace',
}

export function toTypst(
  template: TemplateDocument,
  variables: Record<string, string>,
  resolvedFontFamily?: string
) {
  const font = resolvedFontFamily
    ? `#set text(font: ${literal(resolvedFontFamily)}, size: 10.5pt)`
    : `#set text(size: 10.5pt) // 渲染服务会解析 ${template.page.fontFamily} 为系统中文字体`

  return `#set page(paper: ${literal(template.page.size)}, margin: ${template.page.marginMm}mm)
${font}
#set par(leading: 0.72em)
#let pf-col(body) = {
  set text(hyphenate: true)
  show regex("[A-Za-z0-9._@/-]{8,}"): it => it.text.clusters().intersperse(sym.zws).join()
  block(width: 100%, breakable: true, body)
}

${emitBlocks(template.content?.content, variables)}`.trimEnd()
}

function walkContent(
  node: JSONContent | undefined,
  visit: (node: JSONContent) => void
) {
  if (!node) return
  visit(node)
  node.content?.forEach((child) => walkContent(child, visit))
}

function emitBlocks(
  blocks: JSONContent[] | undefined,
  variables: Record<string, string>
): string {
  return (blocks || [])
    .map((block) => emitBlock(block, variables))
    .filter(Boolean)
    .join("\n\n")
}

function emitBlock(
  node: JSONContent,
  variables: Record<string, string>
): string {
  switch (node.type) {
    case "heading": {
      const level = Number(node.attrs?.level || 1)
      const heading = `#heading(level: ${level})[${emitInlines(node.content, variables)}]`
      return withAlign(node.attrs?.textAlign, heading)
    }
    case "paragraph": {
      const body = emitInlines(node.content, variables)
      if (!body) return ""
      return withAlign(node.attrs?.textAlign, body)
    }
    case "bulletList":
      return emitList(node, false, variables)
    case "orderedList":
      return emitList(node, true, variables)
    case "table": {
      const headers = asStringArray(node.attrs?.headers)
      const rows = asStringMatrix(node.attrs?.rows)
      const cells = [
        ...headers.map((cell) => `strong(${textCall(cell)})`),
        ...rows.flat().map(textCall),
      ].join(",\n  ")
      return `#table(\n  columns: ${Math.max(headers.length, 1)},\n  stroke: 0.5pt + rgb("cbd5e1"),\n  inset: 6pt,\n  fill: (x, y) => if y == 0 { rgb("f1f5f9") },\n  ${cells}\n)`
    }
    case "horizontalRule":
      return '#line(length: 100%, stroke: 0.6pt + rgb("cbd5e1"))'
    case "spacer":
      return `#v(${Number(node.attrs?.heightMm || 8)}mm)`
    case "pageBreak":
      return "#pagebreak()"
    case "image": {
      const src = String(node.attrs?.src || "")
      if (!src) return "// 图片尚未上传"
      const width = Number(node.attrs?.widthPercent || 100)
      const image = `#align(center, image("assets/uploaded-image", width: ${width}%))`
      const caption = String(node.attrs?.caption || "")
      return caption
        ? `${image}\n#align(center, text(size: 8pt, fill: rgb("64748b"), ${literal(caption)}))`
        : image
    }
    case "columns": {
      const columns = node.content || []
      const gap = Number(node.attrs?.gapMm || 8)
      const widths = normalizeColumnWidths(node.attrs?.widths, columns.length)
      const fr = widths.map((width) => `${width}fr`).join(", ")
      const cells = columns
        .map((column) => `pf-col[${emitBlocks(column.content, variables)}]`)
        .join(",\n  ")
      return `#grid(\n  columns: (${fr}),\n  column-gutter: ${gap}mm,\n  align: top,\n  ${cells}\n)`
    }
    default:
      return emitBlocks(node.content, variables)
  }
}

function emitList(
  node: JSONContent,
  ordered: boolean,
  variables: Record<string, string>
) {
  const items = (node.content || [])
    .map((item) => `[${emitBlocks(item.content, variables)}]`)
    .filter((item) => item !== "[]")
  if (items.length === 0) return ""
  return `#${ordered ? "enum" : "list"}${items.join("")}`
}

function emitInlines(
  nodes: JSONContent[] | undefined,
  variables: Record<string, string>
) {
  return (nodes || [])
    .map((node) => {
      if (node.type === "hardBreak") return "#linebreak()"
      if (node.type === "variable") {
        const key = String(node.attrs?.key || "")
        const fallback = String(node.attrs?.fallback || "")
        return `#${textCall(resolveVariable(key, fallback, variables) || `{{${key}}}`)}`
      }
      if (node.type !== "text" || !node.text) return ""
      let expr = textCall(node.text)
      const marks = new Set((node.marks || []).map((mark) => mark.type))
      if (marks.has("italic")) expr = `emph(${expr})`
      if (marks.has("bold")) expr = `strong(${expr})`
      return `#${expr}`
    })
    .join("")
}

function withAlign(align: unknown, body: string) {
  if (align === "center" || align === "right") {
    return `#align(${align})[${body}]`
  }
  return body
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item ?? "")) : []
}

function asStringMatrix(value: unknown) {
  return Array.isArray(value) ? value.map(asStringArray) : []
}

const literal = (value: string) => JSON.stringify(value)
const textCall = (value: string) => `text(${literal(value)})`
