// 字体列表从后端 /api/fonts 动态获取，不再硬编码。
// 与后端 fonts/ 目录保持一致。

import { fontFiles, initFontData } from "@/lib/typst/font-family"
import { apiOrigin } from "@/lib/api/client"
import {
  normalizeCompilerDiagnostics,
  parseTypstDiagnostics,
  type RawCompilerDiagnostic,
  type TypstDiagnostic,
} from "@/lib/typst/diagnostics"

let fontDataReady: Promise<void> | null = null

async function ensureFontsReady(): Promise<string[]> {
  if (!fontDataReady) {
    fontDataReady = initFontData()
  }
  await fontDataReady
  return fontFiles()
}

type TypstCompilerInstance = {
  reset: () => Promise<void>
  addSource: (path: string, source: string) => void
  compile: (options: {
    mainFilePath: string
    inputs?: Record<string, string>
    diagnostics?: "none" | "unix" | "full"
  }) => Promise<{
    result?: Uint8Array
    diagnostics?: RawCompilerDiagnostic[]
  }>
}

type TypstApi = {
  use: (provider: {
    key: string
    forRoles: Array<"compiler" | "renderer">
    provides: unknown[]
  }) => void
  setCompilerInitOptions: (options: { getModule: () => string }) => void
  setRendererInitOptions: (options: { getModule: () => string }) => void
  getCompiler: () => Promise<TypstCompilerInstance>
  resetShadow: () => Promise<void>
  mapShadow: (path: string, content: Uint8Array) => Promise<void>
  svg: (
    options:
      | { mainContent: string; inputs?: Record<string, string> }
      | { vectorData: Uint8Array }
  ) => Promise<string>
}

export type PreviewImage = {
  name: string
  bytes: Uint8Array
}

export type PreviewCompileOutcome =
  | {
      ok: true
      pages: string[]
      diagnostics: TypstDiagnostic[]
    }
  | {
      ok: false
      error: string
      diagnostics: TypstDiagnostic[]
    }

const readyKey = "__paperFlowTypstReady"

let boot: Promise<TypstApi> | null = null
let queue: Promise<unknown> = Promise.resolve()

function startTypst(): Promise<TypstApi> {
  if (!boot) {
    boot = (async () => {
      const mod = await import("@myriaddreamin/typst.ts")
      const typst = mod.$typst as unknown as TypstApi
      const globals = globalThis as typeof globalThis & {
        [readyKey]?: boolean
      }
      if (!globals[readyKey]) {
        try {
          const files = await ensureFontsReady()
          typst.use({
            key: "paper-flow-fonts",
            forRoles: ["compiler"],
            provides: [
              mod.loadFonts(
                files.map((name) => `${apiOrigin}/fonts/${name}`),
                { assets: false }
              ),
            ],
          })
          typst.setCompilerInitOptions({
            getModule: () => "/typst/compiler",
          })
          typst.setRendererInitOptions({
            getModule: () => "/typst/renderer",
          })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error)
          if (!/already/i.test(message)) {
            throw error
          }
        }
        globals[readyKey] = true
      }
      return typst
    })()
  }
  return boot
}

/**
 * 编译 Typst 源码为分页 SVG，并返回结构化错误与警告诊断（含精确行列号）。
 */
export function compileTypstPreview(options: {
  compiledSource: string
  originalSource: string
  images?: PreviewImage[]
  stringInputs?: Record<string, string>
}): Promise<PreviewCompileOutcome> {
  const {
    compiledSource,
    originalSource,
    images = [],
    stringInputs = {},
  } = options

  const run = queue.then(async (): Promise<PreviewCompileOutcome> => {
    try {
      const typst = await startTypst()
      const compiler = await typst.getCompiler()
      await compiler.reset()
      await typst.resetShadow()
      for (const image of images) {
        await typst.mapShadow(`/assets/${image.name}`, image.bytes)
      }
      compiler.addSource("/main.typ", compiledSource)
      const compiled = await compiler.compile({
        mainFilePath: "/main.typ",
        inputs: stringInputs,
        diagnostics: "full",
      })

      const diagnostics = normalizeCompilerDiagnostics(
        compiled.diagnostics,
        originalSource
      )

      if (!compiled.result || compiled.result.byteLength === 0) {
        const firstErr =
          diagnostics.find((d) => d.severity === "error")?.message ??
          diagnostics[0]?.message ??
          "排版编译未生成页面"
        return {
          ok: false,
          error: firstErr,
          diagnostics:
            diagnostics.length > 0
              ? diagnostics
              : [
                  {
                    from: 0,
                    to: Math.min(1, originalSource.length),
                    line: null,
                    col: null,
                    severity: "error",
                    message: firstErr,
                  },
                ],
        }
      }

      const svg = await typst.svg({ vectorData: compiled.result })
      if (!svg) {
        return {
          ok: false,
          error: "没有排出页面",
          diagnostics,
        }
      }

      return {
        ok: true,
        pages: sanitizeSvg(svg),
        diagnostics,
      }
    } catch (error) {
      const fallbackDiagnostics = parseTypstDiagnostics(error, originalSource)
      return {
        ok: false,
        error: typstErrorText(error),
        diagnostics: fallbackDiagnostics,
      }
    }
  })

  queue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function sanitizeSvg(svg: string): string[] {
  const html = new DOMParser().parseFromString(svg, "text/html")
  const documents = [...html.body.children].filter(
    (element): element is SVGSVGElement =>
      element.tagName.toLowerCase() === "svg"
  )
  if (documents.length === 0) {
    throw new Error("排版结果不是 SVG")
  }
  const pages = documents.flatMap((document, index) =>
    splitDocumentPages(document, index)
  )
  if (pages.length === 0) {
    throw new Error("没有排出页面")
  }
  return pages
}

function splitDocumentPages(root: Element, documentIndex: number): string[] {
  stripUnsafe(root)
  const sheets = [...root.children].filter((child) =>
    child.classList.contains("typst-page")
  )
  const docWidth = root.getAttribute("data-width") || root.getAttribute("width")
  if (sheets.length <= 1 || !docWidth) {
    return [root.outerHTML]
  }

  const shared = [...root.children].filter(
    (child) => !child.classList.contains("typst-page")
  )
  const pages: string[] = []
  for (let index = 0; index < sheets.length; index += 1) {
    const sheet = sheets[index]
    const height = sheetHeight(sheet, sheets[index + 1])
    if (!height) {
      return [root.outerHTML]
    }
    const { x } = readTranslate(sheet.getAttribute("transform"))
    const page = root.cloneNode(false) as Element
    page.setAttribute("viewBox", `0 0 ${docWidth} ${height}`)
    page.setAttribute("width", docWidth)
    page.setAttribute("height", height)
    page.setAttribute("data-width", docWidth)
    page.setAttribute("data-height", height)
    for (const node of shared) {
      page.appendChild(node.cloneNode(true))
    }
    const sheetClone = sheet.cloneNode(true) as Element
    sheetClone.setAttribute("transform", `translate(${x}, 0)`)
    page.appendChild(sheetClone)
    prefixSvgIds(page, `p${documentIndex}-${index}-`)
    pages.push(page.outerHTML)
  }
  return pages
}

function sheetHeight(sheet: Element, next: Element | undefined): string | null {
  const height = sheet.getAttribute("data-page-height")
  if (height) {
    return height
  }
  if (!next) {
    return null
  }
  const delta =
    readTranslate(next.getAttribute("transform")).y -
    readTranslate(sheet.getAttribute("transform")).y
  return Number.isFinite(delta) && delta > 0 ? String(delta) : null
}

function readTranslate(transform: string | null): { x: number; y: number } {
  const match = transform?.match(
    /translate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+))?\s*\)/
  )
  if (!match) {
    return { x: 0, y: 0 }
  }
  return { x: Number(match[1]), y: Number(match[2] ?? 0) }
}

function prefixSvgIds(root: Element, prefix: string) {
  const ids = new Set<string>()
  for (const element of [root, ...root.querySelectorAll("[id]")]) {
    const id = element.getAttribute("id")
    if (id) {
      ids.add(id)
    }
  }
  if (ids.size === 0) {
    return
  }
  const sorted = [...ids].sort((a, b) => b.length - a.length)
  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const attr of [...element.attributes]) {
      if (attr.name === "id") {
        continue
      }
      const next = rewriteSvgReferences(attr.value, ids, sorted, prefix)
      if (next !== attr.value) {
        element.setAttribute(attr.name, next)
      }
    }
    const id = element.getAttribute("id")
    if (id && ids.has(id)) {
      element.setAttribute("id", prefix + id)
    }
  }
  for (const style of root.querySelectorAll("style")) {
    const text = style.textContent
    if (!text?.includes("url(#")) {
      continue
    }
    let next = text
    for (const id of sorted) {
      next = next.replaceAll(`url(#${id})`, `url(#${prefix}${id})`)
    }
    if (next !== text) {
      style.textContent = next
    }
  }
}

function rewriteSvgReferences(
  value: string,
  ids: Set<string>,
  sorted: string[],
  prefix: string
): string {
  let next = value
  if (next.includes("url(#")) {
    for (const id of sorted) {
      next = next.replaceAll(`url(#${id})`, `url(#${prefix}${id})`)
    }
  }
  if (next.startsWith("#") && ids.has(next.slice(1))) {
    next = `#${prefix}${next.slice(1)}`
  }
  return next
}

function stripUnsafe(root: Element) {
  root.querySelectorAll("script").forEach((node) => node.remove())
  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const attr of [...element.attributes]) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim().toLowerCase()
      if (name.startsWith("on") || value.startsWith("javascript:")) {
        element.removeAttribute(attr.name)
      }
    }
  }
}

export function typstErrorText(error: unknown): string {
  const raw =
    error instanceof Error && error.message.trim()
      ? error.message
      : typeof error === "string" && error.trim()
        ? error
        : ""
  const messages = [...raw.matchAll(/message:\s*"([^"]+)"/g)].map(
    (match) => match[1]
  )
  if (messages.length > 0) {
    return [...new Set(messages)].join("\n")
  }
  return raw || "排版失败"
}
