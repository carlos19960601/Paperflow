import type { Config } from "@typstyle/typstyle-wasm-bundler"

const config: Partial<Config> = {}

type Formatter = typeof import("@typstyle/typstyle-wasm-bundler")

let loading: Promise<Formatter> | null = null

function loadFormatter() {
  loading ??= import("@typstyle/typstyle-wasm-bundler")
  return loading
}

export async function formatTypst(source: string) {
  const { format } = await loadFormatter()
  return format(source, config)
}

export async function formatTypstRange(
  source: string,
  start: number,
  end: number
) {
  const { format_range } = await loadFormatter()
  const result = format_range(source, start, end, config)
  try {
    return { start: result.start, end: result.end, text: result.text }
  } finally {
    result.free()
  }
}

export function readableFormatError(error: unknown) {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : ""
  const clipped = detail.replace(/\s+/g, " ").trim().slice(0, 180)
  return clipped ? `无法格式化这段源码。${clipped}` : "无法格式化这段源码。"
}