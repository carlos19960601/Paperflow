export type TypstDiagnostic = {
  from: number
  to: number
  line: number | null // 1-based 行号，用于界面展示与跳转
  col: number | null // 1-based 列号，用于界面展示与跳转
  severity: "error" | "warning"
  message: string
  hint?: string
}

export type RawCompilerDiagnostic = {
  package?: string
  path?: string
  severity?: string
  range?: string
  message?: string
  hints?: string[]
}

/**
 * 为高频 Typst 报错与弃用警告补充可操作的中文修复建议。
 */
export function inferDiagnosticHint(message: string): string | undefined {
  const lower = message.toLowerCase()
  if (lower.includes("json.decode") && lower.includes("deprecated")) {
    return "建议直接声明字典默认值，或改用 json(bytes(...)) 读取字节流。"
  }
  if (lower.startsWith("unknown variable:")) {
    return "请检查变量或函数名拼写，确认是否已通过 #let 定义或 #import 引入。"
  }
  if (lower.includes("file not found") || lower.includes("access denied")) {
    if (message.includes("/assets/")) {
      return "请展开编辑器底部「图片」面板上传对应图片，并使用 #image(\"/assets/文件名\") 引用。"
    }
    return "请检查引用路径是否正确。"
  }
  if (
    lower.includes("unclosed delimiter") ||
    lower.includes("expected closing") ||
    lower.includes("unexpected end of")
  ) {
    return "请检查括号 ()、方括号 []、花括号 {} 或引号是否成对闭合。"
  }
  if (lower.includes("expected expression")) {
    return "此处缺少合法的 Typst 表达式，请检查参数值或符号是否完整。"
  }
  if (lower.includes("unknown font family")) {
    return "当前环境未找到该字体家族，可改用系统已载入的中英文字体。"
  }
  return undefined
}

/**
 * 将 `@myriaddreamin/typst.ts` `diagnostics: 'full'` 返回的结构化诊断转换为编辑器与预览统一使用的诊断对象。
 */
export function normalizeCompilerDiagnostics(
  rawItems: RawCompilerDiagnostic[] | undefined,
  source: string
): TypstDiagnostic[] {
  if (!rawItems || rawItems.length === 0) return []

  const results: TypstDiagnostic[] = []
  const seen = new Set<string>()

  for (const raw of rawItems) {
    const rawSeverity = String(raw.severity ?? "").toLowerCase()
    // 跳过调用栈 trace / 纯提示项，避免把辅助追踪误判为错误
    if (
      rawSeverity === "trace" ||
      rawSeverity === "hint" ||
      rawSeverity === "info"
    ) {
      if (results.length > 0 && raw.message && !results[results.length - 1].hint) {
        results[results.length - 1].hint = raw.message.trim()
      }
      continue
    }

    const severity: "error" | "warning" = rawSeverity.includes("warn")
      ? "warning"
      : "error"
    const message = (raw.message ?? "").trim()
    if (!message) continue

    const parsedRange = parseRange(raw.range, source)
    const hintFromCompiler =
      Array.isArray(raw.hints) && raw.hints.length > 0
        ? raw.hints.join("；").trim()
        : undefined
    const hint = inferDiagnosticHint(message) ?? hintFromCompiler

    const dedupeKey = `${severity}:${parsedRange.line ?? 0}:${parsedRange.col ?? 0}:${message}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    results.push({
      from: parsedRange.from,
      to: parsedRange.to,
      line: parsedRange.line,
      col: parsedRange.col,
      severity,
      message,
      hint,
    })
  }

  // 错误优先排列，其次按行号排序
  results.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "error" ? -1 : 1
    }
    return (a.line ?? 999999) - (b.line ?? 999999)
  })

  return results
}

function parseRange(
  range: string | undefined,
  source: string
): {
  from: number
  to: number
  line: number | null
  col: number | null
} {
  if (!range) {
    return { from: 0, to: Math.min(1, source.length), line: null, col: null }
  }
  const match = /^(\d+):(\d+)(?:-(\d+):(\d+))?$/.exec(range.trim())
  if (!match) {
    return { from: 0, to: Math.min(1, source.length), line: null, col: null }
  }

  // typst.ts full 模式下行号为 0-based，字符偏移在部分版本为 0-based/1-based
  const startLine0 = Number.parseInt(match[1], 10)
  const startCharRaw = Number.parseInt(match[2], 10)
  const endLine0 = match[3] !== undefined ? Number.parseInt(match[3], 10) : startLine0
  const endCharRaw =
    match[4] !== undefined ? Number.parseInt(match[4], 10) : startCharRaw + 1

  const line = Math.max(1, startLine0 + 1)
  const col = Math.max(1, startCharRaw + 1)

  const from = offsetAtZeroBased(source, startLine0, startCharRaw)
  const rawTo = offsetAtZeroBased(source, endLine0, endCharRaw)
  const to = Math.max(from + 1, rawTo)

  return { from, to, line, col }
}

function offsetAtZeroBased(
  text: string,
  lineZero: number,
  colZero: number
): number {
  const lines = text.split("\n")
  if (lines.length === 0) return 0
  const clampedLine = Math.min(Math.max(lineZero, 0), lines.length - 1)
  let offset = 0
  for (let i = 0; i < clampedLine; i += 1) {
    offset += lines[i].length + 1
  }
  const lineText = lines[clampedLine] ?? ""
  return offset + Math.min(Math.max(colZero, 0), lineText.length)
}

/**
 * 兜底解析器：当异常直接以字符串或 Error 抛出时提取诊断信息。
 */
export function parseTypstDiagnostics(
  error: unknown,
  source: string
): TypstDiagnostic[] {
  const raw =
    error instanceof Error && error.message.trim()
      ? error.message
      : typeof error === "string" && error.trim()
        ? error
        : ""
  if (!raw) return []

  const diagnostics: TypstDiagnostic[] = []

  // 解析 SourceDiagnostic 块（区分 Error / Warning）
  const blockPattern =
    /SourceDiagnostic\s*\{\s*severity:\s*(Error|Warning)[\s\S]*?message:\s*"((?:[^"\\]|\\.)*)"/g
  let blockMatch
  while ((blockMatch = blockPattern.exec(raw)) !== null) {
    const severity: "error" | "warning" =
      blockMatch[1] === "Warning" ? "warning" : "error"
    const message = blockMatch[2].replace(/\\"/g, '"').trim()
    if (!message) continue
    diagnostics.push({
      from: 0,
      to: Math.min(1, source.length),
      line: null,
      col: null,
      severity,
      message,
      hint: inferDiagnosticHint(message),
    })
  }

  if (diagnostics.length > 0) {
    return diagnostics
  }

  const messages = [...raw.matchAll(/message:\s*"([^"]+)"/g)].map((m) => m[1])
  const primaryMessage =
    messages.length > 0
      ? [...new Set(messages)].join("\n")
      : raw.split("\n")[0]?.trim() || raw.slice(0, 200)

  const spanPattern = /[┌├].+?:(\d+):(\d+)/g
  let spanMatch
  while ((spanMatch = spanPattern.exec(raw)) !== null) {
    const line = Number.parseInt(spanMatch[1], 10)
    const col = Number.parseInt(spanMatch[2], 10)
    if (line > 0 && col > 0) {
      const from = offsetAtZeroBased(source, line - 1, Math.max(col - 1, 0))
      diagnostics.push({
        from,
        to: from + 1,
        line,
        col,
        severity: "error",
        message: primaryMessage,
        hint: inferDiagnosticHint(primaryMessage),
      })
    }
  }

  if (diagnostics.length === 0) {
    const lineHint = raw.match(/line\s+(\d+)/i)
    const line = lineHint ? Number.parseInt(lineHint[1], 10) : null
    const from =
      line && line > 0 ? offsetAtZeroBased(source, line - 1, 0) : 0
    diagnostics.push({
      from,
      to: Math.min(from + 1, Math.max(source.length, 1)),
      line: line && line > 0 ? line : null,
      col: line && line > 0 ? 1 : null,
      severity: "error",
      message: primaryMessage,
      hint: inferDiagnosticHint(primaryMessage),
    })
  }

  return diagnostics
}
