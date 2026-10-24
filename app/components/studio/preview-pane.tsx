"use client"

import { useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import { VariablesPanel } from "@/components/studio/variables-panel"
import type { TypstDiagnostic } from "@/lib/typst/diagnostics"
import type { TypstInput, TypstInputValue } from "@/lib/typst/inputs"
import { cn } from "@/lib/utils"

type PreviewPhase = "idle" | "loading" | "ready" | "error"
type ExportPhase = "idle" | "exporting" | "done" | "error"

type PreviewPaneProps = {
  hasFile: boolean
  templatePath: string
  pages: string[]
  phase: PreviewPhase
  error: string | null
  diagnostics: TypstDiagnostic[]
  note?: string | null
  exportPhase: ExportPhase
  exportError: string | null
  dirty: boolean
  inputs: TypstInput[]
  inputValues: Record<string, TypstInputValue>
  variablesOpen: boolean
  onToggleVariables: () => void
  onChangeInputValue: (name: string, next: TypstInputValue) => void
  onResetInputDefaults: () => void
  onInsertSampleInput: () => void
  onExportWithCurrentInputs: () => void
  onJumpToDiagnostic: (item: TypstDiagnostic) => void
}

export function PreviewPane({
  hasFile,
  templatePath,
  pages,
  phase,
  error,
  diagnostics,
  note,
  exportPhase,
  exportError,
  dirty,
  inputs,
  inputValues,
  variablesOpen,
  onToggleVariables,
  onChangeInputValue,
  onResetInputDefaults,
  onInsertSampleInput,
  onExportWithCurrentInputs,
  onJumpToDiagnostic,
}: PreviewPaneProps) {
  const [zoom, setZoom] = useState(100)
  const [diagCollapsed, setDiagCollapsed] = useState(false)

  const pageCount = pages.length
  const errors = diagnostics.filter((d) => d.severity === "error")
  const warnings = diagnostics.filter((d) => d.severity === "warning")
  const hasCompileError = phase === "error" || errors.length > 0
  const hasOverlayDiagnostics =
    hasCompileError || warnings.length > 0 || Boolean(error)

  function handleZoomIn() {
    setZoom((prev) => Math.min(prev + 15, 200))
  }

  function handleZoomOut() {
    setZoom((prev) => Math.max(prev - 15, 50))
  }

  function handleResetZoom() {
    setZoom(100)
  }

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col bg-paper-well"
      aria-label="预览"
    >
      {/* ── 顶部工具栏（统一 h-10 = 40px 标尺对齐） ──────────────────── */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3">
        {/* 左侧状态微标 */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            纸面预览
          </span>
          <div className="h-3.5 w-px shrink-0 bg-border" />

          <div className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground tabular-nums">
            {exportPhase === "exporting" ? (
              <>
                <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                <span className="truncate text-foreground">生成 PDF 中…</span>
              </>
            ) : exportPhase === "done" && !hasCompileError ? (
              <>
                <CheckCircle2 className="status-badge-pop size-3.5 shrink-0 text-success" />
                <span className="truncate font-medium text-success">
                  PDF 已下载
                </span>
              </>
            ) : phase === "loading" ? (
              <>
                <Loader2 className="size-3.5 shrink-0 animate-spin text-warning" />
                <span className="truncate text-warning">
                  {pageCount > 0 ? "刷新排版中" : "正在排版"}
                </span>
              </>
            ) : hasCompileError ? (
              <>
                <AlertCircle className="size-3.5 shrink-0 text-destructive" />
                <span className="truncate font-medium text-destructive">
                  {errors.length > 0 ? `${errors.length} 处排版错误` : "排版错误"}
                </span>
              </>
            ) : pageCount > 0 ? (
              <>
                <span className="size-1.5 shrink-0 rounded-full bg-success" />
                <span className="text-foreground">共 {pageCount} 页</span>
                {warnings.length > 0 ? (
                  <span className="truncate text-warning">
                    · {warnings.length} 条警告
                  </span>
                ) : null}
              </>
            ) : (
              <span>等待文稿</span>
            )}
          </div>
        </div>

        {/* 右侧：模板变量抽屉开关 + 纸面缩放控制 */}
        <div className="flex shrink-0 items-center gap-1.5">
          {hasFile ? (
            <button
              type="button"
              aria-expanded={variablesOpen}
              title="展开/收起模板变量面板 (⌘I)"
              onClick={onToggleVariables}
              className={cn(
                "btn-pressable inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                variablesOpen
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground hover:bg-muted"
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              <span>模板变量</span>
              {inputs.length > 0 ? (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.2 font-mono text-[11px] tabular-nums transition-colors",
                    variablesOpen
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {inputs.length}
                </span>
              ) : null}
            </button>
          ) : null}

          {pageCount > 0 ? (
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
              <button
                type="button"
                className="btn-pressable flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40"
                title="缩小"
                aria-label="缩小"
                disabled={zoom <= 50}
                onClick={handleZoomOut}
              >
                <ZoomOut className="size-3.5" />
              </button>

              <button
                type="button"
                className="btn-pressable px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                title="重置缩放至 100%"
                aria-label="重置缩放"
                onClick={handleResetZoom}
              >
                {zoom}%
              </button>

              <button
                type="button"
                className="btn-pressable flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40"
                title="放大"
                aria-label="放大"
                disabled={zoom >= 200}
                onClick={handleZoomIn}
              >
                <ZoomIn className="size-3.5" />
              </button>

              {zoom !== 100 ? (
                <button
                  type="button"
                  className="btn-pressable flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  title="还原 100%"
                  aria-label="还原 100%"
                  onClick={handleResetZoom}
                >
                  <RotateCcw className="size-3" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── 纸面预览主视口：左侧全高沉浸式纸张 + 右侧独立入参与 API 检查栏 ── */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* 左侧：纸面画布视口（全高度自由滚动，支持自适应缩放） */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {hasOverlayDiagnostics ? (
          <div
            role={hasCompileError ? "alert" : "status"}
            aria-live="polite"
            className={cn(
              "diagnostic-overlay-animate z-20 mx-auto w-full max-w-[42rem]",
              pageCount > 0
                ? "pointer-events-none absolute top-3 right-4 left-4 w-auto"
                : "px-4 pt-6 lg:px-8"
            )}
          >
            <div
              className={cn(
                "pointer-events-auto overflow-hidden rounded-lg border bg-card/96 text-card-foreground shadow-lg backdrop-blur-xs transition-colors",
                hasCompileError ? "border-destructive/40" : "border-warning/40"
              )}
            >
              {/* 悬浮卡片摘要栏 */}
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
                <div className="flex items-center gap-2 text-xs font-medium">
                  {hasCompileError ? (
                    <AlertCircle className="size-3.5 shrink-0 text-destructive" />
                  ) : (
                    <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                  )}
                  <span
                    className={
                      hasCompileError ? "text-destructive" : "text-warning"
                    }
                  >
                    {errors.length > 0 && warnings.length > 0
                      ? `${errors.length} 处排版错误 · ${warnings.length} 条警告`
                      : errors.length > 0
                        ? `${errors.length} 处排版错误`
                        : warnings.length > 0
                          ? `${warnings.length} 条排版警告`
                          : "排版异常"}
                  </span>
                </div>

                <button
                  type="button"
                  className="btn-pressable inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  onClick={() => setDiagCollapsed((prev) => !prev)}
                  aria-expanded={!diagCollapsed}
                >
                  <span>{diagCollapsed ? "展开详情" : "收起"}</span>
                  <ChevronDown
                    className={cn(
                      "size-3 transition-transform duration-200 ease-out",
                      !diagCollapsed && "rotate-180"
                    )}
                  />
                </button>
              </div>

              {/* 诊断条目列表（平滑高度折叠展开） */}
              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
                  !diagCollapsed ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <ul className="max-h-48 divide-y divide-border/60 overflow-y-auto">
                    {diagnostics.length > 0 ? (
                      diagnostics.map((item, idx) => {
                        const isErr = item.severity === "error"
                        return (
                          <li
                            key={`${item.severity}-${item.line ?? "x"}-${item.col ?? "x"}-${idx}`}
                            className="flex items-start justify-between gap-3 px-3 py-2 text-xs transition-colors hover:bg-muted/40"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={cn(
                                    "rounded px-1.5 py-0.2 text-[11px] font-medium",
                                    isErr
                                      ? "bg-destructive/12 text-destructive"
                                      : "bg-warning/15 text-warning"
                                  )}
                                >
                                  {isErr ? "错误" : "警告"}
                                </span>
                                <span className="font-medium text-foreground break-words">
                                  {item.message}
                                </span>
                              </div>
                              {item.hint ? (
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                  {item.hint}
                                </p>
                              ) : null}
                            </div>

                            {item.line !== null ? (
                              <button
                                type="button"
                                onClick={() => onJumpToDiagnostic(item)}
                                className="btn-pressable group/btn inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] font-medium tabular-nums text-foreground hover:border-primary/40 hover:bg-primary/8 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                title={`跳转到第 ${item.line} 行`}
                              >
                                <span>
                                  {item.line}:{item.col ?? 1}
                                </span>
                                <ArrowUpRight className="size-3 transition-transform duration-150 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
                              </button>
                            ) : null}
                          </li>
                        )
                      })
                    ) : error ? (
                      <li className="px-3 py-2 text-xs leading-relaxed text-destructive">
                        {error}
                      </li>
                    ) : null}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* 纸面主体滚动区 */}
        <div className="min-h-0 flex-1 overflow-auto px-4 pt-6 pb-12 lg:px-8">
          {pageCount > 0 ? (
            <div
              className={cn(
                "mx-auto flex flex-col items-center gap-8 transition-[width,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
                phase === "loading" && "opacity-80"
              )}
              style={{
                width: `calc(min(42rem, 100%) * ${zoom / 100})`,
                minWidth: "18rem",
              }}
            >
              {pages.map((page, index) => (
                <figure
                  key={index}
                  className="group relative flex w-full flex-col items-center gap-2.5"
                  aria-label={`第 ${index + 1} 页`}
                >
                  {/* 真实 PDF 校样纸：明暗双主题均固定为纯白 #ffffff */}
                  <div
                    className="preview-sheet w-full bg-paper"
                    dangerouslySetInnerHTML={{ __html: page }}
                  />
                  {pageCount > 1 ? (
                    <figcaption className="rounded-full border border-border/70 bg-card/90 px-2.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-muted-foreground shadow-2xs">
                      {index + 1} / {pageCount}
                    </figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          ) : !hasCompileError ? (
            <div className="proofing-plate mx-auto flex min-h-80 w-full max-w-[38rem] flex-col items-center justify-center rounded-md border border-border bg-card p-10 text-center text-card-foreground shadow-xs">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileText className="size-4 text-primary" />
                <span>
                  {phase === "loading" ? "正在准备校样纸面…" : "校样看版台就绪"}
                </span>
              </h3>
              <p className="mt-2 max-w-[36ch] text-xs leading-relaxed text-muted-foreground">
                {note
                  ? note
                  : phase === "loading"
                    ? "正在加载 Typst 排版引擎与字体字库…"
                    : "左侧编写 Typst 模板，此处以纯白矢量校样即时呈现成稿效果，并可开启右上角「模板变量」联调参数。"}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* 右侧：独立「模板变量」侧边栏（全高度展示，平滑展开/折叠） */}
      {hasFile ? (
        <aside
          aria-label="模板变量"
          className={cn(
            "relative flex h-full shrink-0 flex-col border-l border-border bg-card text-card-foreground shadow-xs transition-[width,opacity] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden",
            variablesOpen
              ? "w-80 sm:w-88 md:w-96 opacity-100"
              : "w-0 opacity-0 pointer-events-none border-transparent"
          )}
        >
          <div className="flex h-full w-80 sm:w-88 md:w-96 flex-col min-w-0">
            <VariablesPanel
              templatePath={templatePath}
              inputs={inputs}
              values={inputValues}
              dirty={dirty}
              onChangeValue={onChangeInputValue}
              onResetDefaults={onResetInputDefaults}
              onInsertSampleInput={onInsertSampleInput}
              onClose={onToggleVariables}
            />
          </div>
        </aside>
      ) : null}
    </div>
  </section>
  )
}
