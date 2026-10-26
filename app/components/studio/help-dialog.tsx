"use client"

import { useEffect, useRef, useState } from "react"
import {
  X,
  Keyboard,
  Code,
  Sparkles,
  BookOpen,
  Terminal,
  ExternalLink,
  Copy,
  Check,
  FileText,
  Lightbulb,
} from "lucide-react"
import { Button } from "@/components/ui/button"

type HelpDialogProps = {
  onClose: () => void
}

type TabKey = "shortcuts" | "snippets" | "guide"

export function HelpDialog({ onClose }: HelpDialogProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("shortcuts")
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  // 打开时记录触发元素并把焦点移入弹窗；卸载时把焦点还给触发元素
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    return () => {
      previouslyFocusedRef.current?.focus()
    }
  }, [])

  // 全局 Esc 关闭 + Tab 焦点陷阱（仅在弹窗打开期间生效）
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== "Tab") return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  async function handleCopy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr))
      }, 1600)
    } catch {
      // 忽略无剪贴板权限时的异常
    }
  }

  return (
    <div
      className="modal-backdrop-animate fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-3 backdrop-blur-xs select-none sm:p-5"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
        tabIndex={-1}
        className="modal-card-animate flex max-h-[min(92vh,720px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 固定顶栏 Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <BookOpen className="size-4" />
            </div>
            <div>
              <h2
                id="help-dialog-title"
                className="text-sm font-semibold text-foreground"
              >
                快捷键与开发指引
              </h2>
              <p className="text-xs text-muted-foreground">
                Paperflow · 可编程 PDF 排版与渲染服务
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://typst.app/docs/reference/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground"
              title="在新标签页中打开 Typst 官方语法参考"
            >
              <BookOpen className="size-3.5 text-primary" />
              <span>官方语法参考</span>
              <ExternalLink className="size-3" />
            </a>
            <button
              type="button"
              className="btn-pressable flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              onClick={onClose}
              aria-label="关闭指南"
            >
              <X className="size-4 transition-transform duration-150 hover:rotate-90" />
            </button>
          </div>
        </div>

        {/* 分类切换选项卡 Tabs */}
        <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/20 px-5 py-2">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "shortcuts"}
            onClick={() => setActiveTab("shortcuts")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "shortcuts"
                ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <Keyboard className="size-3.5 text-primary" />
            <span>常用快捷键</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "snippets"}
            onClick={() => setActiveTab("snippets")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "snippets"
                ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <Code className="size-3.5 text-primary" />
            <span>常用排版代码片段</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "guide"}
            onClick={() => setActiveTab("guide")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "guide"
                ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <Sparkles className="size-3.5 text-primary" />
            <span>开发指引与 API</span>
          </button>
        </div>

        {/* 内容展示区 Body（独立滚动，高度严格受限） */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 text-xs select-text">
          {/* Tab 1: 常用快捷键 */}
          {activeTab === "shortcuts" && (
            <div className="space-y-4">
              <div>
                <h3 className="mb-2.5 flex items-center gap-1.5 font-semibold text-foreground">
                  <Keyboard className="size-3.5 text-primary" />
                  <span>核心键盘快捷键</span>
                </h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2.5">
                    <span className="text-muted-foreground">
                      保存当前文稿并即时排版
                    </span>
                    <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground shadow-2xs">
                      ⌘S / Ctrl+S
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2.5">
                    <span className="text-muted-foreground">
                      一键格式化 Typst 源码
                    </span>
                    <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground shadow-2xs">
                      ⌥⇧F / Shift+Alt+F
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2.5">
                    <span className="text-muted-foreground">
                      展开/收起模板变量
                    </span>
                    <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground shadow-2xs">
                      ⌘I / Ctrl+I
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2.5">
                    <span className="text-muted-foreground">
                      展开/收起左侧文件树
                    </span>
                    <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground shadow-2xs">
                      ⌘B / Ctrl+B
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2.5">
                    <span className="text-muted-foreground">
                      切换明暗主题 (暖纸白/暗房墨)
                    </span>
                    <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground shadow-2xs">
                      D
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2.5">
                    <span className="text-muted-foreground">
                      编辑器内代码自动补全
                    </span>
                    <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground shadow-2xs">
                      Ctrl+Space
                    </kbd>
                  </div>
                </div>
              </div>

              {/* 常用操作建议卡片 */}
              <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5">
                <h4 className="mb-1.5 flex items-center gap-1.5 font-semibold text-foreground">
                  <Lightbulb className="size-3.5 shrink-0 text-warning" />
                  <span>工作台高效排印贴士</span>
                </h4>
                <ul className="list-inside list-disc space-y-1.5 text-muted-foreground">
                  <li>
                    <strong className="text-foreground">编译诊断定位：</strong>
                    右侧预览区顶部浮层或底部状态栏报错时，点击「行:列」可直接跳转定位至出错代码行。
                  </li>
                  <li>
                    <strong className="text-foreground">预览缩放调节：</strong>
                    预览工具栏支持 50% ~ 200%
                    自由缩放或一键全宽自适应，无论大图细览或整体版式皆可从容检视。
                  </li>
                  <li>
                    <strong className="text-foreground">即时参数调试：</strong>
                    打开「模板变量」面板填写的参数会自动持久化，生成 PDF
                    时可直接复用，免去重复输入的繁琐。
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Tab 2: 常用排版代码片段 */}
          {activeTab === "snippets" && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">
                    Typst 常用排版片段
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    点击右上角即可一键复制开箱即用的版式原语到编辑器中
                  </p>
                </div>
                <a
                  href="https://typst.app/docs/reference/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  官方语法文档
                  <ExternalLink className="size-3" />
                </a>
              </div>

              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {/* 1. 页面尺寸与中文排版 */}
                <div className="flex flex-col justify-between rounded-lg border border-border bg-muted/25 p-2.5">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">
                        页面尺寸与中文排版
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            "snippet-page",
                            `#set page(paper: "a4", margin: (x: 20mm, y: 22mm))\n#set text(size: 10.5pt, lang: "zh")\n#set par(justify: true, leading: 0.75em)`
                          )
                        }
                        className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {copiedKey === "snippet-page" ? (
                          <>
                            <Check className="size-3 text-success" />
                            <span className="text-success">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>复制</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      标准 A4 边距、中文字体识别与对齐间距
                    </p>
                  </div>
                  <pre className="bg-editor mt-1.5 overflow-x-auto rounded border border-border p-2 font-mono text-[11px] leading-snug text-foreground">
                    {`#set page(paper: "a4", margin: (x: 20mm, y: 22mm))
#set text(size: 10.5pt, lang: "zh")
#set par(justify: true, leading: 0.75em)`}
                  </pre>
                </div>

                {/* 2. 两栏栅格排版 */}
                <div className="flex flex-col justify-between rounded-lg border border-border bg-muted/25 p-2.5">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">
                        左右双栏排版 (单据信头)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            "snippet-grid",
                            `#grid(\n  columns: (1fr, auto),\n  align: (left + bottom, right + bottom),\n  [*客户名称*：上海知行科技有限公司],\n  [单据编号：#raw("PF-2026-0108") \\\\ 开具日期：2026-10-24]\n)`
                          )
                        }
                        className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {copiedKey === "snippet-grid" ? (
                          <>
                            <Check className="size-3 text-success" />
                            <span className="text-success">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>复制</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      两端对齐的甲乙方信息或单号时间栏
                    </p>
                  </div>
                  <pre className="bg-editor mt-1.5 overflow-x-auto rounded border border-border p-2 font-mono text-[11px] leading-snug text-foreground">
                    {`#grid(
  columns: (1fr, auto),
  align: (left + bottom, right + bottom),
  [*客户名称*：上海知行科技有限公司],
  [单据编号：#raw("PF-2026-0108") \\
   开具日期：2026-10-24]
)`}
                  </pre>
                </div>

                {/* 3. 结构化数据表格 */}
                <div className="flex flex-col justify-between rounded-lg border border-border bg-muted/25 p-2.5">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">
                        结构化表格与表头
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            "snippet-table",
                            `#table(\n  columns: (1fr, 60pt, 80pt),\n  stroke: 0.5pt + luma(200),\n  align: (left, center, right),\n  table.header([*服务项目*], [*数量*], [*金额*]),\n  [PDF 排版引擎私有化部署], [1], [¥ 8,000.00],\n  [单据模板定制与联调], [2], [¥ 4,800.00],\n)`
                          )
                        }
                        className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {copiedKey === "snippet-table" ? (
                          <>
                            <Check className="size-3 text-success" />
                            <span className="text-success">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>复制</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      账单清单、费用表及列宽对齐控制
                    </p>
                  </div>
                  <pre className="bg-editor mt-1.5 overflow-x-auto rounded border border-border p-2 font-mono text-[11px] leading-snug text-foreground">
                    {`#table(
  columns: (1fr, 60pt, 80pt),
  stroke: 0.5pt + luma(200),
  align: (left, center, right),
  table.header([*服务项目*], [*数量*], [*金额*]),
  [PDF 排版引擎私有化部署], [1], [¥ 8,000.00],
  [单据模板定制与联调], [2], [¥ 4,800.00],
)`}
                  </pre>
                </div>

                {/* 4. 页眉、页脚与动态页码 */}
                <div className="flex flex-col justify-between rounded-lg border border-border bg-muted/25 p-2.5">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">
                        页眉页脚与动态页码
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            "snippet-footer",
                            `#set page(\n  header: align(right)[#text(8.5pt, fill: luma(120))[Paperflow 单据中心]],\n  footer: context align(center)[\n    #text(8.5pt, fill: luma(120))[- #counter(page).display("1 / 1", both: true) -]\n  ]\n)`
                          )
                        }
                        className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {copiedKey === "snippet-footer" ? (
                          <>
                            <Check className="size-3 text-success" />
                            <span className="text-success">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>复制</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      顶栏说明及底部「当前页 / 总页数」居中展示
                    </p>
                  </div>
                  <pre className="bg-editor mt-1.5 overflow-x-auto rounded border border-border p-2 font-mono text-[11px] leading-snug text-foreground">
                    {`#set page(
  header: align(right)[#text(8.5pt, fill: luma(120))[Paperflow 单据中心]],
  footer: context align(center)[
    #text(8.5pt, fill: luma(120))[- #counter(page).display("1 / 1", both: true) -]
  ]
)`}
                  </pre>
                </div>

                {/* 5. 循环遍历动态数据 */}
                <div className="flex flex-col justify-between rounded-lg border border-border bg-muted/25 p-2.5">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">
                        循环遍历动态列表
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            "snippet-loop",
                            `#for (i, item) in items.enumerate() [\n  #block(width: 100%, stroke: 0.5pt + luma(210), inset: 7pt, radius: 4pt)[\n    *#(i + 1). #item.name* —— 数量: #item.qty, 单价: #item.price\n  ]\n]`
                          )
                        }
                        className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {copiedKey === "snippet-loop" ? (
                          <>
                            <Check className="size-3 text-success" />
                            <span className="text-success">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>复制</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      根据 API 传入的条目数组动态渲染列表块
                    </p>
                  </div>
                  <pre className="bg-editor mt-1.5 overflow-x-auto rounded border border-border p-2 font-mono text-[11px] leading-snug text-foreground">
                    {`#for (i, item) in items.enumerate() [
  #block(width: 100%, stroke: 0.5pt + luma(210), inset: 6pt, radius: 4pt)[
    *#(i + 1). #item.name* —— 数量: #item.qty, 单价: #item.price
  ]
]`}
                  </pre>
                </div>

                {/* 6. 图片与资产引用 */}
                <div className="flex flex-col justify-between rounded-lg border border-border bg-muted/25 p-2.5">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">
                        插入图片资产 (Logo/印章)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            "snippet-image",
                            `#image("/assets/logo.png", width: 36%)`
                          )
                        }
                        className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {copiedKey === "snippet-image" ? (
                          <>
                            <Check className="size-3 text-success" />
                            <span className="text-success">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>复制</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      引用当前模板已上传的图片文件或签名戳记
                    </p>
                  </div>
                  <pre className="bg-editor mt-1.5 overflow-x-auto rounded border border-border p-2 font-mono text-[11px] leading-snug text-foreground">
                    {`#image("/assets/logo.png", width: 36%)`}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: 开发指引与 API */}
          {activeTab === "guide" && (
            <div className="space-y-3.5">
              {/* Typst 官方语法参考文档卡片 */}
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-3.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                      <BookOpen className="size-3.5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">
                        Typst 官方语法参考与函数手册
                      </h4>
                      <p className="mt-0.5 text-muted-foreground">
                        查阅 Typst 官方全量文档，包含 <code>page</code>、
                        <code>text</code>、<code>grid</code>、<code>table</code>
                        、<code>image</code> 等内建原语、样式规则及数学公式。
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://typst.app/docs/reference/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground shadow-xs transition-opacity hover:opacity-90"
                  >
                    <span>查阅官方参考文档</span>
                    <ExternalLink className="size-3" />
                  </a>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 border-t border-primary/15 pt-2 text-[11px] text-muted-foreground">
                  <span>
                    官方文档主页：
                    <a
                      href="https://typst.app/docs/"
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-primary underline underline-offset-2"
                    >
                      https://typst.app/docs/
                    </a>
                  </span>
                  <span>
                    官方语法快速入门：
                    <a
                      href="https://typst.app/docs/tutorial/"
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-primary underline underline-offset-2"
                    >
                      https://typst.app/docs/tutorial/
                    </a>
                  </span>
                </div>
              </div>

              {/* 动态变量与 HTTP API 双栏并排对照 */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {/* 动态传参机制 */}
                <div className="flex flex-col justify-between rounded-lg border border-border bg-muted/25 p-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-1.5 font-semibold text-foreground">
                        <Sparkles className="size-3.5 text-primary" />
                        <span>动态变量声明 (sys.inputs)</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            "guide-inputs",
                            `// 1. 标量变量（带默认值）\n#let title = sys.inputs.at("title", default: "发票结算单")\n#let total = sys.inputs.at("total", default: 1280)\n\n// 2. 结构化字典与数组（API 直接传 JSON 对象/数组）\n#let customer = sys.inputs.at("customer", default: (name: "某某科技"))\n#let items = sys.inputs.at("items", default: ((title: "技术服务", fee: 1280),))`
                          )
                        }
                        className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {copiedKey === "guide-inputs" ? (
                          <>
                            <Check className="size-3 text-success" />
                            <span className="text-success">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>复制</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="mt-1 leading-relaxed text-muted-foreground">
                      模板中使用{" "}
                      <code className="font-mono font-semibold text-foreground">
                        sys.inputs.at
                      </code>{" "}
                      声明。后端将 JSON 对象/数组直接转换为原生 Typst
                      字典与数组，无需手动解码：
                    </p>
                  </div>
                  <pre className="bg-editor mt-2 overflow-x-auto rounded border border-border p-2 font-mono text-[11px] leading-snug text-foreground">
                    {`// 1. 标量变量（带默认值）
#let title = sys.inputs.at("title", default: "结算单")
#let total = sys.inputs.at("total", default: 1280)

// 2. 结构化字典与数组 (JSON 直接映射)
#let customer = sys.inputs.at("customer", default: (name: "某科技"))
#let items = sys.inputs.at("items", default: ((title: "技术服务", fee: 1280),))`}
                  </pre>
                </div>

                {/* HTTP API 调用说明 */}
                <div className="flex flex-col justify-between rounded-lg border border-border bg-muted/25 p-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-1.5 font-semibold text-foreground">
                        <Terminal className="size-3.5 text-primary" />
                        <span>HTTP API (POST /api/pdf)</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            "guide-api",
                            `{\n  "name": "finance/invoice",\n  "params": {\n    "title": "发票结算单",\n    "total": 1280,\n    "customer": { "name": "某某科技" },\n    "items": [{ "title": "技术服务", "fee": 1280 }]\n  }\n}`
                          )
                        }
                        className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {copiedKey === "guide-api" ? (
                          <>
                            <Check className="size-3 text-success" />
                            <span className="text-success">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>复制</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="mt-1 leading-relaxed text-muted-foreground">
                      业务系统向{" "}
                      <code className="font-mono text-foreground">
                        POST /api/pdf
                      </code>{" "}
                      传入模板路径与{" "}
                      <code className="font-mono text-foreground">params</code>{" "}
                      即可获得 Base64 编码的 PDF：
                    </p>
                  </div>
                  <pre className="bg-editor mt-2 overflow-x-auto rounded border border-border p-2 font-mono text-[11px] leading-snug text-foreground">
                    {`{
  "name": "finance/invoice",
  "params": {
    "title": "发票结算单",
    "total": 1280,
    "customer": { "name": "某某科技" },
    "items": [{ "title": "技术服务", "fee": 1280 }]
  }
}`}
                  </pre>
                  <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <Lightbulb className="mt-px size-3 shrink-0 text-warning" />
                    <span>
                      提示：按 <code>⌘I</code> 打开「模板变量」即可实时调试数据，并一键复制对应的完整 cURL 请求命令。
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 固定底栏 Footer */}
        <div className="flex items-center justify-between border-t border-border/70 px-5 py-2.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="size-3.5 text-primary" />
            <span>查阅官方完整语法：</span>
            <a
              href="https://typst.app/docs/reference/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono font-medium text-primary hover:underline"
            >
              typst.app/docs/reference
              <ExternalLink className="size-3" />
            </a>
          </div>

          <Button size="sm" onClick={onClose}>
            我知道了
          </Button>
        </div>
      </div>
    </div>
  )
}
