export type TypstJson =
  | null
  | boolean
  | number
  | string
  | TypstJson[]
  | { [key: string]: TypstJson }

export type TypstInput =
  | {
      name: string
      kind: "string"
      defaultValue: string
    }
  | {
      name: string
      kind: "number"
      defaultValue: string
    }
  | {
      name: string
      kind: "array"
      defaultValue: string[]
    }
  | {
      name: string
      kind: "json"
      defaultValue: string
    }
  | {
      name: string
      kind: "json-array"
      defaultValue: string
    }
  | {
      name: string
      kind: "json-string"
      defaultValue: string
    }

export type TypstInputValue = string | string[] | TypstJson

type InputCallSpan = {
  name: string
  input: TypstInput
  start: number
  end: number
}

const callPattern = /^sys\s*\.\s*inputs\s*\.\s*at(?![\p{L}\p{N}_])\s*\(/u
const numberPattern = /^[+-]?(?:\d+\.\d+|\d+|\.\d+)(?:e[+-]?\d+)?$/i

/**
 * 扫描源码中所有 `sys.inputs.at("name", default: ...)` 调用点及其起止偏移。
 */
function scanInputCalls(source: string): InputCallSpan[] {
  const calls: InputCallSpan[] = []
  let index = 0

  while (index < source.length) {
    const current = source[index]
    if (current === "/" && source[index + 1] === "/") {
      const next = source.indexOf("\n", index + 2)
      index = next < 0 ? source.length : next + 1
      continue
    }
    if (current === "/" && source[index + 1] === "*") {
      const next = source.indexOf("*/", index + 2)
      index = next < 0 ? source.length : next + 2
      continue
    }
    if (current === '"') {
      const parsed = decodeString(source, index)
      index = parsed ? parsed.end : index + 1
      continue
    }
    if (current === "`") {
      const end = skipRaw(source, index)
      index = end > index ? end : index + 1
      continue
    }
    if (
      !isIdentChar(source[index - 1] ?? "") &&
      callPattern.test(source.slice(index))
    ) {
      const parsed = parseAtCall(source, index)
      if (parsed) {
        if (parsed.name) {
          calls.push({
            name: parsed.name,
            input: parsed.input,
            start: index,
            end: parsed.end,
          })
        }
        index = parsed.end
        continue
      }
      index += 3
      continue
    }
    index += 1
  }

  return calls
}

/**
 * 从源码里找出声明的 `sys.inputs.at("name", default: ...)` 变量列表（按首次出现顺序去重）。
 * - 字典默认值如 `(amount: 100)` 或 `(:)` -> `json`（API 传 JSON 对象）
 * - 字典数组默认值如 `((name: "甲"),)` -> `json-array`（API 传 JSON 数组）
 * - 普通数组默认值如 `("甲", "乙")` 或 `()` -> `array`
 * - 纯数字字面量默认值如 `1280` -> `number`
 * - 内容为合法 JSON 对象/数组的字符串默认值如 `"{\"amount\": 100}"` -> `json-string`（API 传 JSON 字符串）
 * - 其余 -> `string`
 */
export function findTypstInputs(source: string): TypstInput[] {
  const found: TypstInput[] = []
  const seen = new Set<string>()
  for (const call of scanInputCalls(source)) {
    if (!seen.has(call.name)) {
      seen.add(call.name)
      found.push(call.input)
    }
  }
  return found
}

export function defaultInputValues(
  inputs: TypstInput[]
): Record<string, TypstInputValue> {
  return Object.fromEntries(
    inputs.map((input) => [
      input.name,
      input.kind === "array" ? [...input.defaultValue] : input.defaultValue,
    ])
  )
}

export function mergeInputValues(
  inputs: TypstInput[],
  saved: Record<string, TypstInputValue> | null | undefined
): Record<string, TypstInputValue> {
  const next: Record<string, TypstInputValue> = {}
  for (const input of inputs) {
    const existing = saved?.[input.name]
    if (input.kind === "array") {
      if (
        Array.isArray(existing) &&
        existing.every((item) => typeof item === "string")
      ) {
        next[input.name] = [...existing]
      } else {
        next[input.name] = [...input.defaultValue]
      }
      continue
    }
    if (typeof existing === "string") {
      next[input.name] = existing
    } else {
      next[input.name] = input.defaultValue
    }
  }
  return next
}

/**
 * 逐项校验并生成 API `params` 字典与逐字段错误提示。
 * 若某字段填写不合法，在 `fallbackParams` 中回退到默认值以便预览与示例请求不断裂。
 */
export function resolveTypstInputValues(
  inputs: TypstInput[],
  values: Record<string, TypstInputValue>
): {
  ok: boolean
  params: Record<string, TypstInputValue>
  errors: Record<string, string>
  firstError: string | null
} {
  const params: Record<string, TypstInputValue> = {}
  const errors: Record<string, string> = {}

  for (const input of inputs) {
    const raw = values[input.name]

    if (input.kind === "array") {
      params[input.name] =
        Array.isArray(raw) && raw.every((item) => typeof item === "string")
          ? raw
          : [...input.defaultValue]
      continue
    }

    if (input.kind === "number") {
      const text = typeof raw === "string" ? raw.trim() : ""
      if (!text) {
        errors[input.name] = `${input.name} 需要填写数值`
        params[input.name] = Number(input.defaultValue) || 0
        continue
      }
      const normalized = text.startsWith("+") ? text.slice(1) : text
      if (!numberPattern.test(normalized) || !Number.isFinite(Number(normalized))) {
        errors[input.name] = `${input.name} 需要是有效数字`
        params[input.name] = Number(input.defaultValue) || 0
        continue
      }
      params[input.name] = Number(normalized)
      continue
    }

    if (
      input.kind === "json" ||
      input.kind === "json-array" ||
      input.kind === "json-string"
    ) {
      const text = typeof raw === "string" ? raw.trim() : ""
      const fallback = parseJsonFallback(input)
      if (!text) {
        errors[input.name] = `${input.name} 需要填写 JSON`
        params[input.name] = fallback
        continue
      }
      let data: unknown
      try {
        data = JSON.parse(text)
      } catch {
        errors[input.name] = `${input.name} 不是合法的 JSON`
        params[input.name] = fallback
        continue
      }
      if (input.kind === "json" && !isPlainObject(data)) {
        errors[input.name] = `${input.name} 需要是 JSON 对象`
        params[input.name] = fallback
        continue
      }
      if (input.kind === "json-array" && !Array.isArray(data)) {
        errors[input.name] = `${input.name} 需要是 JSON 数组`
        params[input.name] = fallback
        continue
      }
      if (
        input.kind === "json-string" &&
        !isPlainObject(data) &&
        !Array.isArray(data)
      ) {
        errors[input.name] = `${input.name} 需要是 JSON 对象或数组`
        params[input.name] = fallback
        continue
      }
      params[input.name] =
        input.kind === "json-string"
          ? JSON.stringify(data)
          : (data as TypstInputValue)
      continue
    }

    params[input.name] = typeof raw === "string" ? raw : input.defaultValue
  }

  const firstError = Object.values(errors)[0] ?? null
  return {
    ok: firstError === null,
    params,
    errors,
    firstError,
  }
}

export function parseTypstInputValues(
  inputs: TypstInput[],
  values: Record<string, TypstInputValue>
):
  | { ok: true; values: Record<string, TypstInputValue> }
  | { ok: false; message: string } {
  const resolved = resolveTypstInputValues(inputs, values)
  if (!resolved.ok) {
    return { ok: false, message: resolved.firstError ?? "变量格式不正确" }
  }
  return { ok: true, values: resolved.params }
}

/**
 * 将测试变量注入 WASM 预览副本，保持所有换行数不变，使诊断行号与源码 100% 对齐，
 * 同时支持字符串、数值、数组、字典与 JSON 字符串，与 Rust 后端 `params_to_dict` 行为一致。
 */
export function buildPreviewCompilationInput(
  source: string,
  inputs: TypstInput[],
  values: Record<string, TypstInputValue>
): {
  compiledSource: string
  stringInputs: Record<string, string>
} {
  if (inputs.length === 0) {
    return { compiledSource: source, stringInputs: {} }
  }

  const { params } = resolveTypstInputValues(inputs, values)
  const inputKindMap = new Map(inputs.map((item) => [item.name, item.kind]))
  const stringInputs: Record<string, string> = {}

  for (const [key, val] of Object.entries(params)) {
    if (typeof val === "string") {
      stringInputs[key] = val
    } else if (typeof val === "number" || typeof val === "boolean") {
      stringInputs[key] = String(val)
    }
  }

  const calls = scanInputCalls(source)
  if (calls.length === 0) {
    return { compiledSource: source, stringInputs }
  }

  let compiledSource = source
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const call = calls[i]
    if (!(call.name in params)) continue
    const val = params[call.name]
    const kind = inputKindMap.get(call.name) ?? "string"
    const originalSlice = source.slice(call.start, call.end)
    const newlineCount = countNewlines(originalSlice)
    const literal = valueToTypstExpr(val, kind)
    const replacement = `(${literal}${"\n".repeat(newlineCount)})`
    compiledSource =
      compiledSource.slice(0, call.start) +
      replacement +
      compiledSource.slice(call.end)
  }

  return { compiledSource, stringInputs }
}

function countNewlines(text: string): number {
  let count = 0
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") count += 1
  }
  return count
}

function valueToTypstExpr(
  value: TypstInputValue,
  kind: TypstInput["kind"]
): string {
  if (kind === "number" && typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  if (kind === "array" && Array.isArray(value)) {
    if (value.length === 0) return "()"
    return `(${value.map((item) => toTypstString(String(item))).join(", ")},)`
  }
  if (kind === "json" || kind === "json-array") {
    return jsonToTypstExpr(value, true)
  }
  return toTypstString(typeof value === "string" ? value : String(value ?? ""))
}

function jsonToTypstExpr(value: unknown, topLevel: boolean): string {
  if (value === null || value === undefined) {
    return topLevel ? '""' : "none"
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "none"
  }
  if (typeof value === "string") {
    return toTypstString(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "()"
    return `(${value.map((item) => jsonToTypstExpr(item, false)).join(", ")},)`
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) return "(:)"
    return `(${entries
      .map(([k, v]) => `${toTypstString(k)}: ${jsonToTypstExpr(v, false)}`)
      .join(", ")})`
  }
  return '""'
}

function toTypstString(text: string): string {
  let out = '"'
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === "\\") out += "\\\\"
    else if (ch === '"') out += '\\"'
    else if (ch === "\n") out += "\\n"
    else if (ch === "\r") out += "\\r"
    else if (ch === "\t") out += "\\t"
    else out += ch
  }
  out += '"'
  return out
}

function parseJsonFallback(
  input: Extract<
    TypstInput,
    { kind: "json" | "json-array" | "json-string" }
  >
): TypstInputValue {
  try {
    const parsed = JSON.parse(input.defaultValue) as TypstJson
    return input.kind === "json-string" ? JSON.stringify(parsed) : parsed
  } catch {
    if (input.kind === "json-string") return "{}"
    return input.kind === "json-array" ? [] : {}
  }
}

function parseAtCall(
  source: string,
  start: number
): { name: string; input: TypstInput; end: number } | null {
  const matched = callPattern.exec(source.slice(start))
  if (!matched) {
    return null
  }
  const open = start + matched[0].length - 1
  const args = splitArgs(source, open)
  if (!args) {
    return null
  }

  let name = ""
  let input: TypstInput = { name: "", kind: "string", defaultValue: "" }
  for (const arg of args.raw) {
    const named = splitNamed(arg)
    if (named) {
      if (named.name === "default") {
        input = readDefault(named.value)
      }
      continue
    }
    if (!name) {
      const key = readStringLiteral(arg)
      if (key) {
        name = key
      }
    }
  }
  input = { ...input, name }
  return { name, input, end: args.end }
}

function readDefault(value: string): TypstInput {
  const start = skipTrivia(value, 0)
  const grouped = readGrouped(value, start)
  if (grouped && skipTrivia(value, grouped.end) === value.length) {
    if (grouped.kind === "dict") {
      return {
        name: "",
        kind: "json",
        defaultValue: grouped.data
          ? JSON.stringify(grouped.data, null, 2)
          : "{}",
      }
    }
    if (grouped.kind === "json-array") {
      return {
        name: "",
        kind: "json-array",
        defaultValue: grouped.data
          ? JSON.stringify(grouped.data, null, 2)
          : "[]",
      }
    }
    return { name: "", kind: "array", defaultValue: grouped.items }
  }

  // 检测纯数字字面量默认值（与后端 numeric_input_names 对应）
  const numMatch = /^[+-]?(?:\d+\.\d+|\d+|\.\d+)(?:e[+-]?\d+)?/i.exec(
    value.slice(start)
  )
  if (
    numMatch &&
    skipTrivia(value, start + numMatch[0].length) === value.length
  ) {
    const rawNum = numMatch[0].startsWith("+")
      ? numMatch[0].slice(1)
      : numMatch[0]
    if (Number.isFinite(Number(rawNum))) {
      return { name: "", kind: "number", defaultValue: rawNum }
    }
  }

  // 检测字符串字面量是否为 JSON 对象/数组（例如配合 json(bytes(...)) 使用）
  const decoded = literalToString(value)
  const trimmed = decoded.trim()
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (isPlainObject(parsed) || Array.isArray(parsed)) {
        return {
          name: "",
          kind: "json-string",
          defaultValue: JSON.stringify(parsed, null, 2),
        }
      }
    } catch {
      // 不是合法 JSON，按普通字符串处理
    }
  }

  return { name: "", kind: "string", defaultValue: decoded }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

type Grouped =
  | { kind: "dict"; data: Record<string, unknown> | null; end: number }
  | { kind: "json-array"; data: unknown[] | null; end: number }
  | { kind: "array"; items: string[]; raw: string[]; end: number }

function readGrouped(source: string, start: number): Grouped | null {
  const parts = splitParen(source, start)
  if (!parts) {
    return null
  }
  const inner = source.slice(start + 1, parts.end - 1)
  if (isOnlyColon(inner)) {
    return { kind: "dict", data: {}, end: parts.end }
  }
  if (parts.raw.length > 0 && parts.raw.every(isPair)) {
    return { kind: "dict", data: pairsToObject(parts.raw), end: parts.end }
  }
  if (parts.commas === 0 && parts.raw.length > 0) {
    return null
  }
  if (parts.raw.length > 0 && parts.raw.every(isWholeDict)) {
    const data: unknown[] = []
    for (const part of parts.raw) {
      const grouped = readGrouped(part, skipTrivia(part, 0))
      if (!grouped || grouped.kind !== "dict" || grouped.data === null) {
        return { kind: "json-array", data: null, end: parts.end }
      }
      data.push(grouped.data)
    }
    return { kind: "json-array", data, end: parts.end }
  }
  return {
    kind: "array",
    items: parts.raw.map((part) => literalToString(part)),
    raw: parts.raw,
    end: parts.end,
  }
}

function splitParen(
  source: string,
  open: number
): { raw: string[]; commas: number; end: number } | null {
  if (source[open] !== "(") {
    return null
  }
  const raw: string[] = []
  let depth = 1
  let cursor = open + 1
  let partStart = cursor
  let commas = 0

  while (cursor < source.length) {
    const current = source[cursor]
    if (current === '"') {
      const parsed = decodeString(source, cursor)
      if (!parsed) {
        return null
      }
      cursor = parsed.end
      continue
    }
    if (current === "`") {
      const end = skipRaw(source, cursor)
      if (end <= cursor) {
        return null
      }
      cursor = end
      continue
    }
    if (current === "/" && source[cursor + 1] === "/") {
      const next = source.indexOf("\n", cursor + 2)
      cursor = next < 0 ? source.length : next + 1
      continue
    }
    if (current === "/" && source[cursor + 1] === "*") {
      const next = source.indexOf("*/", cursor + 2)
      if (next < 0) {
        return null
      }
      cursor = next + 2
      continue
    }
    if (current === "(" || current === "[" || current === "{") {
      depth += 1
      cursor += 1
      continue
    }
    if (current === ")" || current === "]" || current === "}") {
      depth -= 1
      if (depth === 0 && current === ")") {
        pushArg(raw, source.slice(partStart, cursor))
        return { raw, commas, end: cursor + 1 }
      }
      if (depth < 0) {
        return null
      }
      cursor += 1
      continue
    }
    if (current === "," && depth === 1) {
      pushArg(raw, source.slice(partStart, cursor))
      commas += 1
      cursor += 1
      partStart = cursor
      continue
    }
    cursor += 1
  }
  return null
}

function isOnlyColon(inner: string) {
  const start = skipTrivia(inner, 0)
  return inner[start] === ":" && skipTrivia(inner, start + 1) === inner.length
}

function isPair(part: string) {
  return splitPair(part) !== null
}

function splitPair(part: string): { key: string; value: string } | null {
  const start = skipTrivia(part, 0)
  const key = readKey(part, start)
  if (!key) {
    return null
  }
  const colon = skipTrivia(part, key.end)
  if (part[colon] !== ":") {
    return null
  }
  if (skipTrivia(part, colon + 1) === part.length) {
    return null
  }
  return { key: key.value, value: part.slice(colon + 1) }
}

function readKey(
  text: string,
  index: number
): { value: string; end: number } | null {
  if (text[index] === '"') {
    const parsed = decodeString(text, index)
    return parsed ? { value: parsed.value, end: parsed.end } : null
  }
  return readTypstIdent(text, index)
}

function readTypstIdent(
  text: string,
  index: number
): { value: string; end: number } | null {
  if (!isIdentStart(text[index] ?? "")) {
    return null
  }
  let cursor = index + 1
  while (
    cursor < text.length &&
    (isIdentChar(text[cursor] ?? "") || text[cursor] === "-")
  ) {
    cursor += 1
  }
  return { value: text.slice(index, cursor), end: cursor }
}

function isWholeDict(part: string) {
  const start = skipTrivia(part, 0)
  const grouped = readGrouped(part, start)
  return (
    grouped?.kind === "dict" && skipTrivia(part, grouped.end) === part.length
  )
}

function pairsToObject(parts: string[]): Record<string, unknown> | null {
  const data: Record<string, unknown> = {}
  for (const part of parts) {
    const pair = splitPair(part)
    if (!pair) {
      return null
    }
    const converted = literalToJson(pair.value)
    if (!converted.ok) {
      return null
    }
    data[pair.key] = converted.data
  }
  return data
}

function literalToJson(
  value: string
): { ok: true; data: unknown } | { ok: false } {
  const start = skipTrivia(value, 0)
  if (value[start] === '"') {
    const parsed = decodeString(value, start)
    if (!parsed || skipTrivia(value, parsed.end) !== value.length) {
      return { ok: false }
    }
    return { ok: true, data: parsed.value }
  }
  if (value[start] === "(") {
    const grouped = readGrouped(value, start)
    if (!grouped || skipTrivia(value, grouped.end) !== value.length) {
      return { ok: false }
    }
    if (grouped.kind === "dict" || grouped.kind === "json-array") {
      return grouped.data === null
        ? { ok: false }
        : { ok: true, data: grouped.data }
    }
    const items: unknown[] = []
    for (const item of grouped.raw) {
      const converted = literalToJson(item)
      if (!converted.ok) {
        return { ok: false }
      }
      items.push(converted.data)
    }
    return { ok: true, data: items }
  }
  const ident = readIdent(value, start)
  if (ident && skipTrivia(value, ident.end) === value.length) {
    if (ident.value === "none") {
      return { ok: true, data: null }
    }
    if (ident.value === "true" || ident.value === "false") {
      return { ok: true, data: ident.value === "true" }
    }
    return { ok: false }
  }
  const number = /^[+-]?(?:\d+\.\d+|\d+|\.\d+)(?:e[+-]?\d+)?/i.exec(
    value.slice(start)
  )
  if (number && skipTrivia(value, start + number[0].length) === value.length) {
    const data = Number(number[0])
    return Number.isFinite(data) ? { ok: true, data } : { ok: false }
  }
  return { ok: false }
}

function splitArgs(
  source: string,
  open: number
): { raw: string[]; end: number } | null {
  const raw: string[] = []
  let depth = 1
  let cursor = open + 1
  let partStart = cursor

  while (cursor < source.length) {
    const current = source[cursor]
    if (current === '"') {
      const parsed = decodeString(source, cursor)
      if (!parsed) {
        return null
      }
      cursor = parsed.end
      continue
    }
    if (current === "`") {
      const end = skipRaw(source, cursor)
      if (end <= cursor) {
        return null
      }
      cursor = end
      continue
    }
    if (current === "/" && source[cursor + 1] === "/") {
      const next = source.indexOf("\n", cursor + 2)
      cursor = next < 0 ? source.length : next + 1
      continue
    }
    if (current === "/" && source[cursor + 1] === "*") {
      const next = source.indexOf("*/", cursor + 2)
      if (next < 0) {
        return null
      }
      cursor = next + 2
      continue
    }
    if (current === "(" || current === "[" || current === "{") {
      depth += 1
      cursor += 1
      continue
    }
    if (current === ")" || current === "]" || current === "}") {
      depth -= 1
      if (depth === 0 && current === ")") {
        pushArg(raw, source.slice(partStart, cursor))
        return { raw, end: cursor + 1 }
      }
      if (depth < 0) {
        return null
      }
      cursor += 1
      continue
    }
    if (current === "," && depth === 1) {
      pushArg(raw, source.slice(partStart, cursor))
      cursor += 1
      partStart = cursor
      continue
    }
    cursor += 1
  }
  return null
}

function pushArg(raw: string[], value: string) {
  const trimmed = value.trim()
  if (trimmed) {
    raw.push(trimmed)
  }
}

function splitNamed(arg: string): { name: string; value: string } | null {
  const start = skipTrivia(arg, 0)
  const ident = readIdent(arg, start)
  if (!ident) {
    return null
  }
  const colon = skipTrivia(arg, ident.end)
  if (arg[colon] !== ":") {
    return null
  }
  return { name: ident.value, value: arg.slice(colon + 1).trim() }
}

function readStringLiteral(arg: string): string | null {
  const start = skipTrivia(arg, 0)
  if (arg[start] !== '"') {
    return null
  }
  const parsed = decodeString(arg, start)
  if (!parsed || skipTrivia(arg, parsed.end) !== arg.length) {
    return null
  }
  return parsed.value
}

function literalToString(value: string): string {
  const start = skipTrivia(value, 0)
  if (value[start] === '"') {
    const parsed = decodeString(value, start)
    return parsed ? parsed.value : ""
  }
  const ident = readIdent(value, start)
  if (ident && skipTrivia(value, ident.end) === value.length) {
    if (ident.value === "none") {
      return ""
    }
    if (ident.value === "true" || ident.value === "false") {
      return ident.value
    }
  }
  const number = /^[+-]?(?:\d+\.\d+|\d+|\.\d+)(?:e[+-]?\d+)?/i.exec(
    value.slice(start)
  )
  if (number && skipTrivia(value, start + number[0].length) === value.length) {
    return number[0]
  }
  return ""
}

function decodeString(
  source: string,
  start: number
): { value: string; end: number } | null {
  if (source[start] !== '"') {
    return null
  }
  let value = ""
  let index = start + 1
  while (index < source.length) {
    const current = source[index]
    if (current === "\\") {
      const next = source[index + 1]
      if (!next) {
        return null
      }
      if (next === "u" && source[index + 2] === "{") {
        const close = source.indexOf("}", index + 3)
        if (close < 0) {
          return null
        }
        const code = Number.parseInt(source.slice(index + 3, close), 16)
        if (!Number.isFinite(code)) {
          return null
        }
        value += String.fromCodePoint(code)
        index = close + 1
        continue
      }
      value +=
        ({ n: "\n", r: "\r", t: "\t" } as Record<string, string>)[next] ?? next
      index += 2
      continue
    }
    if (current === '"') {
      return { value, end: index + 1 }
    }
    value += current
    index += 1
  }
  return null
}

function skipRaw(source: string, start: number): number {
  let ticks = 0
  while (source[start + ticks] === "`") {
    ticks += 1
  }
  if (ticks === 0) {
    return start
  }
  const closer = "`".repeat(ticks)
  const close = source.indexOf(closer, start + ticks)
  if (close < 0) {
    return source.length
  }
  return close + ticks
}

function skipTrivia(text: string, index: number): number {
  let cursor = index
  while (cursor < text.length) {
    const current = text[cursor]
    if (
      current === " " ||
      current === "\t" ||
      current === "\n" ||
      current === "\r"
    ) {
      cursor += 1
      continue
    }
    if (current === "/" && text[cursor + 1] === "/") {
      const next = text.indexOf("\n", cursor + 2)
      cursor = next < 0 ? text.length : next + 1
      continue
    }
    if (current === "/" && text[cursor + 1] === "*") {
      const next = text.indexOf("*/", cursor + 2)
      cursor = next < 0 ? text.length : next + 2
      continue
    }
    break
  }
  return cursor
}

function readIdent(
  text: string,
  index: number
): { value: string; end: number } | null {
  if (!isIdentStart(text[index] ?? "")) {
    return null
  }
  let cursor = index + 1
  while (cursor < text.length && isIdentChar(text[cursor] ?? "")) {
    cursor += 1
  }
  return { value: text.slice(index, cursor), end: cursor }
}

function isIdentStart(char: string) {
  return /[\p{L}_]/u.test(char)
}

function isIdentChar(char: string) {
  return /[\p{L}\p{N}_]/u.test(char)
}
