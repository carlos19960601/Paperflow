"use client"

import { useMemo, useState } from "react"
import {
  Check,
  Code2,
  Copy,
  Download,
  Loader2,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { apiBaseUrl } from "@/lib/api/runtime-config"
import {
  defaultInputValues,
  resolveTypstInputValues,
  type TypstInput,
  type TypstInputValue,
} from "@/lib/typst/inputs"
import { cn } from "@/lib/utils"

const fieldClass =
  "h-8 w-full rounded-md border border-input bg-background px-2.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35"

const textAreaClass =
  "min-h-24 w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-xs leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35"

function kindBadgeLabel(kind: TypstInput["kind"]) {
  switch (kind) {
    case "number":
      return "number"
    case "array":
      return "array"
    case "json":
      return "JSON Object"
    case "json-array":
      return "JSON Array"
    case "json-string":
      return "JSON String"
    default:
      return "string"
  }
}

export function TypstVariableFields({
  inputs,
  values,
  errors,
  idPrefix,
  autoFocusFirst = false,
  onChange,
}: {
  inputs: TypstInput[]
  values: Record<string, TypstInputValue>
  errors?: Record<string, string>
  idPrefix: string
  autoFocusFirst?: boolean
  onChange: (name: string, next: TypstInputValue) => void
}) {
  return (
    <div className="grid gap-3">
      {inputs.map((input, index) => {
        const fieldId = `${idPrefix}-${index}`
        const fieldError = errors?.[input.name]

        if (input.kind === "array") {
          const items = toStringArray(values[input.name])
          return (
            <fieldset key={input.name} className="grid min-w-0 gap-1.5 border-0 p-0">
              <div className="flex items-center justify-between gap-2">
                <legend className="p-0 font-mono text-xs font-medium text-foreground break-all">
                  {input.name}
                </legend>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {kindBadgeLabel(input.kind)}
                </span>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">当前为空数组</p>
              ) : null}
              {items.map((item, itemIdx) => {
                const subId = `${fieldId}-${itemIdx}`
                return (
                  <div key={subId} className="flex items-center gap-1.5">
                    <input
                      id={subId}
                      aria-label={`${input.name} 的第 ${itemIdx + 1} 项`}
                      className={cn(fieldClass, "min-w-0 flex-1")}
                      value={item}
                      autoComplete="off"
                      autoFocus={autoFocusFirst && index === 0 && itemIdx === 0}
                      onChange={(e) => {
                        const next = items.slice()
                        next[itemIdx] = e.target.value
                        onChange(input.name, next)
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`移除 ${input.name} 的第 ${itemIdx + 1} 项`}
                      onClick={() =>
                        onChange(
                          input.name,
                          items.filter((_, idx) => idx !== itemIdx)
                        )
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                )
              })}
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="justify-self-start"
                onClick={() => onChange(input.name, [...items, ""])}
              >
                <Plus className="size-3" />
                <span>添加一项</span>
              </Button>
            </fieldset>
          )
        }

        if (
          input.kind === "json" ||
          input.kind === "json-array" ||
          input.kind === "json-string"
        ) {
          const text = typeof values[input.name] === "string" ? (values[input.name] as string) : ""
          return (
            <div key={input.name} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={fieldId}
                  className="font-mono text-xs font-medium text-foreground break-all"
                >
                  {input.name}
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="btn-pressable rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    onClick={() => {
                      try {
                        const parsed: unknown = JSON.parse(text)
                        onChange(input.name, JSON.stringify(parsed, null, 2))
                      } catch {
                        // 语法有误时不覆盖用户输入
                      }
                    }}
                  >
                    整理 JSON
                  </button>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary">
                    {kindBadgeLabel(input.kind)}
                  </span>
                </div>
              </div>
              <textarea
                id={fieldId}
                aria-invalid={Boolean(fieldError)}
                className={cn(
                  textAreaClass,
                  fieldError && "border-destructive focus-visible:border-destructive"
                )}
                value={text}
                autoComplete="off"
                autoFocus={autoFocusFirst && index === 0}
                spellCheck={false}
                placeholder={input.kind === "json-array" ? "[]" : "{}"}
                onChange={(e) => onChange(input.name, e.target.value)}
              />
              {fieldError ? (
                <p role="alert" className="text-xs text-destructive">
                  {fieldError}
                </p>
              ) : null}
            </div>
          )
        }

        const text = typeof values[input.name] === "string" ? (values[input.name] as string) : ""
        return (
          <div key={input.name} className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={fieldId}
                className="font-mono text-xs font-medium text-foreground break-all"
              >
                {input.name}
              </label>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {kindBadgeLabel(input.kind)}
              </span>
            </div>
            <input
              id={fieldId}
              inputMode={input.kind === "number" ? "decimal" : undefined}
              aria-invalid={Boolean(fieldError)}
              className={cn(
                fieldClass,
                input.kind === "number" && "font-mono tabular-nums",
                fieldError && "border-destructive focus-visible:border-destructive"
              )}
              value={text}
              autoComplete="off"
              autoFocus={autoFocusFirst && index === 0}
              onChange={(e) => onChange(input.name, e.target.value)}
            />
            {fieldError ? (
              <p role="alert" className="text-xs text-destructive">
                {fieldError}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function toStringArray(value: TypstInputValue | undefined): string[] {
  if (!Array.isArray(value)) return []
  const items: string[] = []
  for (const item of value) {
    if (typeof item === "string") {
      items.push(item)
    }
  }
  return items
}

type VariablesPanelProps = {
  templatePath: string
  inputs: TypstInput[]
  values: Record<string, TypstInputValue>
  dirty: boolean
  onChangeValue: (name: string, next: TypstInputValue) => void
  onResetDefaults: () => void
  onInsertSampleInput: () => void
  onClose: () => void
}

export function VariablesPanel({
  templatePath,
  inputs,
  values,
  dirty: _dirty,
  onChangeValue,
  onResetDefaults,
  onInsertSampleInput,
  onClose,
}: VariablesPanelProps) {
  const [copied, setCopied] = useState(false)

  const resolved = useMemo(
    () => resolveTypstInputValues(inputs, values),
    [inputs, values]
  )

  const defaults = useMemo(() => defaultInputValues(inputs), [inputs])
  const hasCustomValues = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(defaults),
    [values, defaults]
  )

  const endpoint = `${apiBaseUrl.replace(/\/$/, "")}/pdf`
  const jsonBody = useMemo(
    () =>
      JSON.stringify(
        {
          name: templatePath,
          params: resolved.params,
        },
        null,
        2
      ),
    [templatePath, resolved.params]
  )

  const curlSnippet = useMemo(() => {
    const escapedBody = jsonBody.replace(/'/g, "'\\''")
    return `curl -X POST '${endpoint}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${escapedBody}'`
  }, [endpoint, jsonBody])

  async function handleCopyCurl() {
    try {
      await navigator.clipboard.writeText(curlSnippet)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // 忽略剪贴板权限限制
    }
  }

  return (
    <div
      className="flex h-full w-full flex-col bg-card text-card-foreground select-text"
      aria-label="模板变量"
    >
      {/* ── 顶部工具栏（统一 h-10 标尺） ─────────────────────────── */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-background px-3">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">模板变量</span>
          <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[11px] tabular-nums text-muted-foreground">
            {inputs.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* 一键复制当前参数对应的 cURL 请求 */}
          <button
            type="button"
            className="btn-pressable inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            title="复制当前变量对应的 API 请求命令 (cURL)"
            onClick={() => void handleCopyCurl()}
          >
            {copied ? (
              <>
                <Check className="status-badge-pop size-3 text-success" />
                <span className="text-success font-medium">已复制 cURL</span>
              </>
            ) : (
              <>
                <Copy className="size-3" />
                <span>复制 cURL</span>
              </>
            )}
          </button>

          {inputs.length > 0 && hasCustomValues ? (
            <button
              type="button"
              className="btn-pressable inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title="一键还原为源码中声明的 default 默认值"
              onClick={onResetDefaults}
            >
              <RotateCcw className="size-3" />
              <span>重置</span>
            </button>
          ) : null}

          <button
            type="button"
            className="btn-pressable flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            title="收起变量面板 (⌘I)"
            aria-label="收起变量面板"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* ── 变量列表滚动区（纯粹、直接、无冗余说教卡片） ───────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
        {inputs.length > 0 ? (
          <div className="space-y-3.5">
            <TypstVariableFields
              inputs={inputs}
              values={values}
              errors={resolved.errors}
              idPrefix="live-var"
              onChange={onChangeValue}
            />
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 py-2 text-xs text-muted-foreground">
            <p className="leading-relaxed">
              当前模板尚未声明变量。在源码中声明{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                sys.inputs.at(...)
              </code>{" "}
              后即可在此实时填参调试。
            </p>
            <pre className="w-full overflow-x-auto rounded-md border border-border/80 bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed text-foreground">
{`#let title = sys.inputs.at("title", default: "结算单")
#let total = sys.inputs.at("total", default: 1280)`}
            </pre>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="btn-pressable gap-1.5"
              onClick={onInsertSampleInput}
            >
              <Sparkles className="size-3 text-primary" />
              <span>插入示例声明</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
