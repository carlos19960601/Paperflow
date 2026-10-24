// Typst 上下文感知自动补全：
// 在 #text(font: "")、#set text(font: "") 等场景中，
// 根据属性名提供对应的值补全（字体、颜色、字号等）。

import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete"
import { fontFamilies, fontSizes, fontWeights, presetColors } from "@/lib/typst/font-family"

// ── Typst 内置颜色名 ────────────────────────────────────────────────
// 覆盖 presetColors 之外的常用 Typst 颜色
const typstColors = [
  ...presetColors.map((c) => c.value),
  "aqua",
  "maroon",
  "navy",
  "olive",
  "teal",
  "fuchsia",
  "lime",
  "silver",
  "eastern",
  "luma(0)",
  "luma(80)",
  "luma(160)",
  "luma(240)",
]

// ── weight 枚举 ──────────────────────────────────────────────────────
const weightValues = [
  "thin",
  "extralight",
  "light",
  "regular",
  "medium",
  "semibold",
  "bold",
  "extrabold",
  "black",
]

// ── style 枚举 ──────────────────────────────────────────────────────
const styleValues = ["normal", "italic", "oblique"]

// ── text 函数的参数名补全 ────────────────────────────────────────────
const textParams = [
  { label: "font", detail: "字体族名", info: 'font: "Roboto"' },
  { label: "size", detail: "字号", info: "size: 12pt" },
  { label: "weight", detail: "字重", info: 'weight: "bold"' },
  { label: "style", detail: "字形", info: 'style: "italic"' },
  { label: "fill", detail: "文字颜色", info: "fill: blue" },
  { label: "lang", detail: "语言", info: 'lang: "zh"' },
  { label: "region", detail: "地区", info: 'region: "cn"' },
  { label: "spacing", detail: "字间距", info: "spacing: 100%" },
  { label: "baseline", detail: "基线偏移", info: "baseline: 0pt" },
  { label: "tracking", detail: "字距", info: "tracking: 0pt" },
  { label: "top-edge", detail: "上边缘", info: 'top-edge: "ascender"' },
  { label: "bottom-edge", detail: "下边缘", info: 'bottom-edge: "descender"' },
  { label: "overhang", detail: "悬挂", info: "overhang: true" },
  { label: "hyphenate", detail: "连字", info: "hyphenate: auto" },
  { label: "ligatures", detail: "连字符", info: "ligatures: true" },
  { label: "number-type", detail: "数字类型", info: 'number-type: "lining"' },
  { label: "number-width", detail: "数字宽度", info: 'number-width: "tabular"' },
]

// ── page 函数的参数名补全 ────────────────────────────────────────────
const pageParams = [
  { label: "paper", detail: "纸张", info: '"a4"' },
  { label: "width", detail: "宽度", info: "210mm" },
  { label: "height", detail: "高度", info: "297mm" },
  { label: "margin", detail: "边距", info: "margin: 2cm" },
  { label: "fill", detail: "背景色", info: "fill: white" },
  { label: "header", detail: "页眉" },
  { label: "footer", detail: "页脚" },
  { label: "columns", detail: "列数", info: "columns: 1" },
  { label: "numbering", detail: "页码格式", info: 'numbering: "1"' },
]

// ── paper 尺寸枚举 ──────────────────────────────────────────────────
const paperSizes = [
  "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8",
  "b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8",
  "us-letter", "us-legal", "us-executive",
]

// ── 语言代码 ────────────────────────────────────────────────────────
const langValues = ["zh", "en", "ja", "ko", "de", "fr", "es", "pt", "ru", "ar"]

// ── 常用 Typst 函数 + #set 目标 ─────────────────────────────────────
const topLevelFunctions = [
  { label: "text", detail: "文本", info: "#text(font: ..., size: ...)[...]" },
  { label: "image", detail: "图片", info: '#image("/path.png")' },
  { label: "table", detail: "表格", info: "#table(columns: 3, ...)" },
  { label: "grid", detail: "网格", info: "#grid(columns: 2, ...)" },
  { label: "align", detail: "对齐", info: "#align(center)[...]" },
  { label: "block", detail: "块", info: "#block(width: 100%, ...)" },
  { label: "box", detail: "行内盒", info: "#box(width: ...)[...]" },
  { label: "stack", detail: "堆叠", info: "#stack(dir: ltr, ...)" },
  { label: "rect", detail: "矩形", info: "#rect(width: ..., fill: ...)" },
  { label: "circle", detail: "圆", info: "#circle(radius: ...)" },
  { label: "line", detail: "线段", info: "#line(length: 100%)" },
  { label: "heading", detail: "标题", info: "#heading(level: 1)[...]" },
  { label: "list", detail: "列表" },
  { label: "enum", detail: "枚举列表" },
  { label: "link", detail: "链接", info: '#link("url")[文字]' },
  { label: "figure", detail: "图表", info: "#figure(image(...), caption: [...])" },
  { label: "pagebreak", detail: "分页", info: "#pagebreak()" },
  { label: "v", detail: "垂直间距", info: "#v(1em)" },
  { label: "h", detail: "水平间距", info: "#h(1em)" },
  { label: "par", detail: "段落", info: "#par(leading: 0.65em)" },
  { label: "page", detail: "页面", info: '#set page("a4")' },
  { label: "place", detail: "定位", info: "#place(top + right)[...]" },
  { label: "set", detail: "设置规则", info: "#set text(size: 12pt)" },
  { label: "show", detail: "显示规则", info: "#show heading: set text(...)" },
  { label: "let", detail: "变量/函数", info: "#let x = ..." },
  { label: "import", detail: "导入", info: '#import "file.typ": *' },
  { label: "include", detail: "包含", info: '#include "file.typ"' },
  { label: "for", detail: "循环", info: "#for x in arr [...]" },
  { label: "if", detail: "条件", info: "#if cond [...] else [...]" },
  { label: "while", detail: "循环", info: "#while cond [...]" },
]

// ── 上下文检测 ───────────────────────────────────────────────────────

type ParamContext =
  | { kind: "font-value"; from: number; typed: string }
  | { kind: "weight-value"; from: number; typed: string; family: string | null }
  | { kind: "style-value"; from: number; typed: string }
  | { kind: "fill-value"; from: number; typed: string }
  | { kind: "size-value"; from: number; typed: string }
  | { kind: "paper-value"; from: number; typed: string }
  | { kind: "lang-value"; from: number; typed: string }
  | { kind: "text-param"; from: number; typed: string }
  | { kind: "page-param"; from: number; typed: string }
  | { kind: "hash-func"; from: number; typed: string }

/**
 * 在当前 text 调用范围内查找已选中的 font 家族名，
 * 用于 weight 补全时按字体过滤可用字重。
 */
function findCurrentFontFamily(source: string, pos: number): string | null {
  const head = source.slice(0, pos)
  // 匹配 #text(、#set text(、show ...: set text( 等调用起点
  const re = /(?:#\s*set\s+text|#\s*text|set\s+text)\s*\(/g
  let last: number | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(head))) last = m.index
  if (last === null) return null
  // 在该调用括号之后、光标之前查找 font: "xxx"
  const seg = source.slice(last, pos)
  const fm = seg.match(/font\s*:\s*"([^"]*)"/)
  return fm ? fm[1] : null
}

/**
 * 分析光标位置的上下文，判断当前应该补全什么。
 * 往回扫描寻找最近的 key: "..." 模式或函数名。
 */
function detectContext(
  source: string,
  pos: number
): ParamContext | null {
  // 向前扫描找到当前行的文本
  const lineStart = source.lastIndexOf("\n", pos - 1) + 1
  const before = source.slice(lineStart, pos)

  // 1. 检测是否在引号内的属性值中: font: "xxx|"
  const quotedValue = before.match(
    /(\w[\w-]*)\s*:\s*"([^"]*?)$/
  )
  if (quotedValue) {
    const key = quotedValue[1]
    const typed = quotedValue[2]
    const from = pos - typed.length

    switch (key) {
      case "font":
        return { kind: "font-value", from, typed }
      case "weight":
        return { kind: "weight-value", from, typed, family: findCurrentFontFamily(source, pos) }
      case "style":
        return { kind: "style-value", from, typed }
      case "paper":
        return { kind: "paper-value", from, typed }
      case "lang":
        return { kind: "lang-value", from, typed }
      case "region":
        return { kind: "lang-value", from, typed }
    }
  }

  // 2. 检测无引号的属性值: fill: bl|  或 size: 1|
  const bareValue = before.match(
    /(\w[\w-]*)\s*:\s*([a-zA-Z0-9.]*)$/
  )
  if (bareValue) {
    const key = bareValue[1]
    const typed = bareValue[2]
    const from = pos - typed.length

    switch (key) {
      case "fill":
        return { kind: "fill-value", from, typed }
      case "size":
        return { kind: "size-value", from, typed }
      case "weight":
        return { kind: "weight-value", from, typed, family: findCurrentFontFamily(source, pos) }
      case "style":
        return { kind: "style-value", from, typed }
    }
  }

  // 3. 检测在函数参数位置，但尚未写属性名: text(|  或  text(font: "...", |
  const funcParam = before.match(
    /#?(?:set\s+)?(\w+)\s*\([^)]*(?:,\s*|\(\s*)(\w[\w-]*)?$/
  )
  if (funcParam) {
    const func = funcParam[1]
    const typed = funcParam[2] ?? ""
    const from = pos - typed.length

    if (func === "text") {
      return { kind: "text-param", from, typed }
    }
    if (func === "page") {
      return { kind: "page-param", from, typed }
    }
  }

  // 3b. 函数刚打开括号: text(| (无逗号之前的情况)
  const funcOpen = before.match(/#?(?:set\s+)?(\w+)\s*\(\s*(\w[\w-]*)?$/)
  if (funcOpen) {
    const func = funcOpen[1]
    const typed = funcOpen[2] ?? ""
    const from = pos - typed.length

    if (func === "text") {
      return { kind: "text-param", from, typed }
    }
    if (func === "page") {
      return { kind: "page-param", from, typed }
    }
  }

  // 4. 检测 # 开头的函数名: #tex|
  const hashFunc = before.match(/#(\w*)$/)
  if (hashFunc) {
    const typed = hashFunc[1]
    const from = pos - typed.length
    return { kind: "hash-func", from, typed }
  }

  return null
}

// ── 生成补全结果 ─────────────────────────────────────────────────────

function toCompletions(
  items: readonly string[],
  from: number,
  typed: string,
  opts?: {
    quoted?: boolean
    detail?: (v: string) => string | undefined
    boost?: (v: string) => number
    type?: string
  }
): CompletionResult | null {
  const lower = typed.toLowerCase()
  const filtered = items.filter((item) =>
    item.toLowerCase().includes(lower)
  )
  if (filtered.length === 0 && typed.length > 0) return null

  const options: Completion[] = filtered.map((item) => ({
    label: item,
    detail: opts?.detail?.(item),
    boost: opts?.boost?.(item),
    type: opts?.type ?? "text",
    apply: opts?.quoted ? item : undefined,
  }))

  return {
    from,
    options,
    filter: true,
  }
}

// ── 主补全函数 ──────────────────────────────────────────────────────

export function typstCompletionSource(
  context: CompletionContext
): CompletionResult | null {
  const { state, pos } = context
  const source = state.doc.toString()

  const ctx = detectContext(source, pos)
  if (!ctx) return null

  switch (ctx.kind) {
    case "font-value": {
      const families = fontFamilies()
      return toCompletions(families, ctx.from, ctx.typed, {
        quoted: true,
        type: "variable",
        detail: () => "字体",
      })
    }

    case "weight-value": {
      // 若已选中具体字体，只提示该字体实际支持的 weight
      const weights = ctx.family ? fontWeights(ctx.family) : []
      const items = weights.length > 0 ? weights : weightValues
      return toCompletions(items, ctx.from, ctx.typed, {
        type: "enum",
        detail: (v) => {
          const map: Record<string, string> = {
            thin: "100", extralight: "200", light: "300",
            regular: "400", medium: "500", semibold: "600",
            bold: "700", extrabold: "800", black: "900",
          }
          return map[v]
        },
      })
    }

    case "style-value": {
      return toCompletions(styleValues, ctx.from, ctx.typed, {
        type: "enum",
      })
    }

    case "fill-value": {
      return toCompletions(typstColors, ctx.from, ctx.typed, {
        type: "constant",
        detail: () => "颜色",
      })
    }

    case "size-value": {
      const sizes = fontSizes.map((s) => `${s}pt`)
      return toCompletions(sizes, ctx.from, ctx.typed, {
        type: "constant",
        detail: () => "字号",
      })
    }

    case "paper-value": {
      return toCompletions(paperSizes, ctx.from, ctx.typed, {
        quoted: true,
        type: "enum",
      })
    }

    case "lang-value": {
      return toCompletions(langValues, ctx.from, ctx.typed, {
        quoted: true,
        type: "enum",
      })
    }

    case "text-param": {
      const options: Completion[] = textParams
        .filter((p) => p.label.toLowerCase().includes(ctx.typed.toLowerCase()))
        .map((p) => ({
          label: p.label,
          detail: p.detail,
          info: p.info,
          type: "property",
          apply: `${p.label}: `,
        }))
      return options.length > 0
        ? { from: ctx.from, options, filter: true }
        : null
    }

    case "page-param": {
      const options: Completion[] = pageParams
        .filter((p) => p.label.toLowerCase().includes(ctx.typed.toLowerCase()))
        .map((p) => ({
          label: p.label,
          detail: p.detail,
          info: p.info,
          type: "property",
          apply: `${p.label}: `,
        }))
      return options.length > 0
        ? { from: ctx.from, options, filter: true }
        : null
    }

    case "hash-func": {
      const options: Completion[] = topLevelFunctions
        .filter((f) => f.label.toLowerCase().includes(ctx.typed.toLowerCase()))
        .map((f) => ({
          label: f.label,
          detail: f.detail,
          info: f.info,
          type: "function",
        }))
      return options.length > 0
        ? { from: ctx.from, options, filter: true }
        : null
    }
  }
}
