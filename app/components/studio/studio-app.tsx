"use client"

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useTheme } from "next-themes"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  Download,
  FilePlus,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Sun,
  Wand2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { FileTree, type FileTreeHandle } from "@/components/studio/file-tree"
import { HelpDialog } from "@/components/studio/help-dialog"
import { ImageBar } from "@/components/studio/image-bar"
import { PreviewPane } from "@/components/studio/preview-pane"
import { ResizeHandle } from "@/components/studio/resize-handle"
import {
  SourceEditor,
  type SourceEditorHandle,
} from "@/components/studio/source-editor"
import { useFileImages } from "@/components/studio/use-file-images"
import { useStudioLayout } from "@/hooks/use-studio-layout"
import { useWorkspace } from "@/components/studio/use-workspace"
import { ApiError } from "@/lib/api/client"
import { downloadPdf, generatePdf } from "@/lib/api/pdf"
import { getFile, saveFile } from "@/lib/api/nodes"
import type { TypstFile, TypstNode } from "@/lib/api/types"
import {
  initialTypst,
  isPathUnder,
  replacePathPrefix,
  sampleInvoiceTypst,
} from "@/lib/org/files"
import { segmentHint, validSegment } from "@/lib/org/names"
import {
  forgetDraft,
  forgetDraftTree,
  recallDraft,
  relocateDraft,
  rememberDraft,
} from "@/lib/studio/draft-backup"
import {
  forgetInputValues,
  forgetInputValuesTree,
  recallInputValues,
  relocateInputValues,
  rememberInputValues,
} from "@/lib/studio/input-storage"
import {
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "@/lib/studio/layout-storage"
import type { TypstDiagnostic } from "@/lib/typst/diagnostics"
import {
  buildPreviewCompilationInput,
  findTypstInputs,
  mergeInputValues,
  parseTypstInputValues,
  type TypstInputValue,
} from "@/lib/typst/inputs"
import { compileTypstPreview } from "@/lib/typst/preview"
import { initFontData } from "@/lib/typst/font-family"
import { cn } from "@/lib/utils"

const autosaveDelay = 1000
const retryDelay = 4000

type Draft = {
  id: number | null
  path: string
  name: string
  content: string
}

const emptyDraft: Draft = { id: null, path: "", name: "", content: "" }

type PreviewPhase = "idle" | "loading" | "ready" | "error"
type Pane = "files" | "source" | "preview"

// 移动端切换条的固定顺序（用于方向键循环切换）
const PANE_ORDER: Pane[] = ["files", "source", "preview"]

function draftFrom(file: TypstFile): Draft {
  return {
    id: file.id,
    path: file.path,
    name: file.name,
    content: file.content,
  }
}

const subscribeNoop = () => () => {}

export function StudioApp() {
  const workspace = useWorkspace()
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  )
  const [helpOpen, setHelpOpen] = useState(false)
  const [pane, setPane] = useState<Pane>("files")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const paneTabRefs = useRef<Record<Pane, HTMLButtonElement | null>>({
    files: null,
    source: null,
    preview: null,
  })

  // 移动端「文件/源码/预览」切换条：方向键循环切换并移动焦点（APG Tabs 模式）
  const handlePaneTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, id: Pane) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      event.preventDefault()
      const idx = PANE_ORDER.indexOf(id)
      const delta = event.key === "ArrowRight" ? 1 : -1
      const next = PANE_ORDER[(idx + delta + PANE_ORDER.length) % PANE_ORDER.length]
      setPane(next)
      paneTabRefs.current[next]?.focus()
    },
    []
  )
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [saved, setSaved] = useState<Draft>(emptyDraft)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [retryable, setRetryable] = useState(false)
  const [restoreNote, setRestoreNote] = useState<string | null>(null)
  const [pages, setPages] = useState<string[]>([])
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>("idle")
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [exportPhase, setExportPhase] = useState<
    "idle" | "exporting" | "done" | "error"
  >("idle")
  const [exportError, setExportError] = useState<string | null>(null)
  const [formatError, setFormatError] = useState<string | null>(null)
  const [formatting, setFormatting] = useState(false)
  const [diagnostics, setDiagnostics] = useState<TypstDiagnostic[]>([])
  const [imagePanelOpen, setImagePanelOpen] = useState(false)
  const [variablesOpen, setVariablesOpen] = useState(false)
  const [inputOverrides, setInputOverrides] = useState<
    Record<string, TypstInputValue>
  >({})
  const [creatingSample, setCreatingSample] = useState(false)

  const draftRef = useRef(draft)
  const savedRef = useRef(saved)
  const contentRef = useRef(draft.content)
  draftRef.current = draft
  savedRef.current = saved
  contentRef.current = draft.content

  const fileTreeRef = useRef<FileTreeHandle>(null)
  const editorRef = useRef<SourceEditorHandle>(null)
  const workspaceSplitRef = useRef<HTMLDivElement>(null)
  const layout = useStudioLayout()
  const persistRef = useRef<(manual?: boolean) => void>(() => {})
  const flightRef = useRef<Promise<boolean> | null>(null)
  const rerunRef = useRef(false)
  const manualRef = useRef(false)

  const fileImages = useFileImages(draft.id ? draft.path : "")
  const inputs = useMemo(() => findTypstInputs(draft.content), [draft.content])
  const effectiveInputValues = useMemo(
    () => mergeInputValues(inputs, inputOverrides),
    [inputs, inputOverrides]
  )
  const previewCompilation = useMemo(
    () =>
      buildPreviewCompilationInput(
        draft.content,
        inputs,
        effectiveInputValues
      ),
    [draft.content, inputs, effectiveInputValues]
  )

  const dirty = draft.id !== null && draft.content !== saved.content
  const nameOk = draft.id === null || validSegment(draft.name)
  const lineCount = useMemo(
    () => (draft.content ? draft.content.split("\n").length : 0),
    [draft.content]
  )

  const hasPreviewableDraft = Boolean(draft.id && draft.content.trim())
  const effectivePages = hasPreviewableDraft ? pages : []
  const effectiveDiagnostics = useMemo(
    () => (hasPreviewableDraft ? diagnostics : []),
    [hasPreviewableDraft, diagnostics]
  )
  const effectivePreviewPhase: PreviewPhase = !hasPreviewableDraft
    ? "idle"
    : fileImages.phase === "loading" || fileImages.phase === "idle"
      ? "loading"
      : fileImages.phase === "error"
        ? "error"
        : previewPhase
  const effectivePreviewError = !hasPreviewableDraft
    ? null
    : fileImages.phase === "error"
      ? fileImages.error
      : previewError

  const errorDiagnostics = useMemo(
    () => effectiveDiagnostics.filter((item) => item.severity === "error"),
    [effectiveDiagnostics]
  )
  const warningDiagnostics = useMemo(
    () => effectiveDiagnostics.filter((item) => item.severity === "warning"),
    [effectiveDiagnostics]
  )
  const hasCompileError =
    effectivePreviewPhase === "error" || errorDiagnostics.length > 0

  const loadedImages = fileImages.images
  const imageKey = loadedImages
    .map((image) => `${image.name}:${image.sha256}`)
    .join("|")

  // 启动时加载字体数据（供编辑器补全和 WASM 预览共用）
  useEffect(() => {
    void initFontData()
  }, [])

  // 预览：WASM typst 编译 + 结构化诊断（含实时测试变量注入）
  useEffect(() => {
    if (!hasPreviewableDraft || fileImages.phase !== "ready") {
      return
    }
    let cancelled = false
    const originalSource = draft.content
    const { compiledSource, stringInputs } = previewCompilation
    const images = loadedImages.map((image) => ({
      name: image.name,
      bytes: image.bytes,
    }))
    const timer = window.setTimeout(() => {
      setPreviewPhase("loading")
      void compileTypstPreview({
        compiledSource,
        originalSource,
        images,
        stringInputs,
      }).then((outcome) => {
        if (cancelled) return
        setDiagnostics(outcome.diagnostics)
        if (outcome.ok) {
          setPages(outcome.pages)
          setPreviewError(null)
          setPreviewPhase("ready")
        } else {
          setPreviewError(outcome.error)
          setPreviewPhase("error")
        }
      })
    }, 260)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    hasPreviewableDraft,
    draft.content,
    previewCompilation,
    fileImages.phase,
    imageKey,
    loadedImages,
  ])

  const exportPhaseRef = useRef(exportPhase)
  exportPhaseRef.current = exportPhase

  useEffect(() => {
    if (exportPhaseRef.current === "exporting") return
    setExportPhase("idle")
    setExportError(null)
  }, [draft.id, draft.content])

  // 全局快捷键：⌘S 保存 · ⌘B 侧边栏 · ⌘I 变量与 API 面板 · D 主题切换
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          Boolean(target.closest(".cm-editor")))

      // 非输入状态下按 D 切换主题
      if (!isInput && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.key === "d" || event.key === "D") {
          event.preventDefault()
          setTheme(resolvedTheme === "dark" ? "light" : "dark")
          return
        }
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === "s") {
        event.preventDefault()
        persistRef.current(true)
      } else if (key === "b") {
        event.preventDefault()
        setSidebarCollapsed((prev) => !prev)
      } else if (key === "i" && draftRef.current.id !== null) {
        event.preventDefault()
        setVariablesOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [resolvedTheme, setTheme])

  // 自动保存
  useEffect(() => {
    if (!draft.id || !draft.path) return
    if (draft.content === saved.content) {
      forgetDraft(draft.path)
      return
    }
    rememberDraft(draft.path, draft.content)
    if (!draft.content.trim() || !validSegment(draft.name)) return
    const timer = window.setTimeout(() => {
      persistRef.current()
    }, autosaveDelay)
    return () => window.clearTimeout(timer)
  }, [draft.content, draft.id, draft.name, draft.path, saved.content])

  // 网络失败自动重试
  useEffect(() => {
    if (!retryable || saveState !== "error" || !dirty) return
    const timer = window.setTimeout(() => {
      persistRef.current()
    }, retryDelay)
    return () => window.clearTimeout(timer)
  }, [dirty, draft.content, draft.path, retryable, saveState])

  // 页面离开前保护未保存内容
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (
        draftRef.current.id &&
        contentRef.current !== savedRef.current.content
      ) {
        event.preventDefault()
      }
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") persistRef.current()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  function insertImage(name: string) {
    editorRef.current?.insertAtCursor(`#image("/assets/${name}")`)
  }

  function insertSampleInputSnippet() {
    editorRef.current?.prependText(
      `#let title = sys.inputs.at("title", default: "结算单")\n#let data = sys.inputs.at("data", default: (amount: 1280))`
    )
  }

  function formatSource() {
    void editorRef.current?.formatDocument()
  }

  const toggleImagePanel = useCallback(() => {
    setImagePanelOpen((prev) => !prev)
  }, [])

  const toggleVariablesPanel = useCallback(() => {
    setVariablesOpen((prev) => !prev)
  }, [])

  const handleChangeInputValue = useCallback(
    (name: string, nextVal: TypstInputValue) => {
      setInputOverrides((prev) => {
        const merged = {
          ...mergeInputValues(inputs, prev),
          [name]: nextVal,
        }
        if (draftRef.current.path) {
          rememberInputValues(draftRef.current.path, merged)
        }
        return merged
      })
    },
    [inputs]
  )

  const handleResetInputDefaults = useCallback(() => {
    setInputOverrides({})
    if (draftRef.current.path) {
      forgetInputValues(draftRef.current.path)
    }
  }, [])

  const handleJumpToDiagnostic = useCallback((item: TypstDiagnostic) => {
    setPane("source")
    window.requestAnimationFrame(() => {
      editorRef.current?.jumpToDiagnostic(item)
    })
  }, [])

  function leaveDraft(action: () => void) {
    const current = draftRef.current
    if (
      current.id === null ||
      contentRef.current === savedRef.current.content
    ) {
      action()
      return
    }
    void requestPersist(true).then((ok) => {
      if (draftRef.current.path !== current.path) return
      if (ok && contentRef.current === savedRef.current.content) {
        action()
        return
      }
      setPendingAction(() => () => {
        forgetDraft(draftRef.current.path)
        const restored = savedRef.current
        contentRef.current = restored.content
        draftRef.current = restored
        setDraft(restored)
        setSaveState("idle")
        setSaveError(null)
        setRetryable(false)
        setRestoreNote(null)
        action()
      })
    })
  }

  function resetPreviewForNewFile(path: string, sourceContent: string) {
    setPages([])
    setDiagnostics([])
    setPreviewError(null)
    setPreviewPhase(sourceContent.trim() ? "loading" : "idle")
    setImagePanelOpen(false)
    setInputOverrides(recallInputValues(path) ?? {})
  }

  function adopt(
    next: Draft,
    state: "idle" | "saved" = "idle",
    openVars?: boolean
  ) {
    resetPreviewForNewFile(next.path, next.content)
    setDraft(next)
    setSaved(next)
    setSaveState(state)
    setSaveError(null)
    setRetryable(false)
    setRestoreNote(null)
    setFormatError(null)
    const hasInputs = findTypstInputs(next.content).length > 0
    setVariablesOpen(openVars ?? hasInputs)
    setPane("source")
  }

  function retarget(oldPath: string, newPath: string) {
    relocateDraft(oldPath, newPath)
    relocateInputValues(oldPath, newPath)
    const apply = (current: Draft): Draft => {
      if (!current.path || !isPathUnder(current.path, oldPath)) return current
      const path = replacePathPrefix(current.path, oldPath, newPath)
      const name = path.slice(path.lastIndexOf("/") + 1)
      return { ...current, path, name }
    }
    setDraft(apply)
    setSaved(apply)
  }

  function closeIfUnder(path: string) {
    if (!isPathUnder(draftRef.current.path, path)) return
    setDraft(emptyDraft)
    setSaved(emptyDraft)
    setPages([])
    setDiagnostics([])
    setPreviewError(null)
    setPreviewPhase("idle")
    setSaveState("idle")
    setSaveError(null)
    setRetryable(false)
    setRestoreNote(null)
    setFormatError(null)
    setImagePanelOpen(false)
    setVariablesOpen(false)
    setInputOverrides({})
  }

  async function openFile(node: TypstNode) {
    setSaveError(null)
    setSaveState("idle")
    setRetryable(false)
    try {
      const server = draftFrom(await getFile(node.path))
      const backup = recallDraft(server.path)
      if (backup !== null && backup !== server.content) {
        resetPreviewForNewFile(server.path, backup)
        setSaved(server)
        setDraft({ ...server, content: backup })
        setRestoreNote("已找回上次尚未同步的本地草稿，正在自动保存。")
        setFormatError(null)
        setVariablesOpen(findTypstInputs(backup).length > 0)
        setPane("source")
        return
      }
      if (backup !== null) forgetDraft(server.path)
      adopt(server, "saved")
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "读取文件失败")
      setSaveState("error")
    }
  }

  async function handleStartCreateBlank() {
    setSidebarCollapsed(false)
    setPane("files")
    window.requestAnimationFrame(() => {
      fileTreeRef.current?.startCreateFile()
    })
  }

  async function handleCreateSampleTemplate() {
    if (creatingSample) return
    setCreatingSample(true)
    setSaveError(null)
    try {
      const existingNames = new Set(
        (workspace.children[""]?.items ?? []).map((n) => n.name)
      )
      let candidate = "invoice-demo"
      let suffix = 2
      while (existingNames.has(candidate)) {
        candidate = `invoice-demo-${suffix}`
        suffix += 1
      }
      const created = await workspace.addFile(
        "",
        candidate,
        sampleInvoiceTypst()
      )
      adopt(draftFrom(created), "saved", true)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "创建示例模板失败")
      setSaveState("error")
    } finally {
      setCreatingSample(false)
    }
  }

  async function persistOnce(manual: boolean) {
    const current = { ...draftRef.current, content: contentRef.current }
    if (!current.id || !current.path) {
      if (manual) {
        setSaveError("请先打开一个模板文件再保存。")
        setSaveState("error")
        setRetryable(false)
      }
      return false
    }
    if (
      current.content === savedRef.current.content &&
      current.path === savedRef.current.path
    ) {
      setSaveError(null)
      setRetryable(false)
      setRestoreNote(null)
      setSaveState("saved")
      forgetDraft(current.path)
      return true
    }
    if (!validSegment(current.name)) {
      if (manual) {
        setSaveError(segmentHint)
        setSaveState("error")
        setRetryable(false)
      }
      return false
    }
    if (!current.content.trim()) {
      if (manual) {
        setSaveError("源码不能为空。")
        setSaveState("error")
        setRetryable(false)
      }
      return false
    }
    const snapshot = current.content
    const path = current.path
    setSaveState("saving")
    setSaveError(null)
    try {
      const updated = await saveFile(path, snapshot)
      if (draftRef.current.path !== path) return true
      const savedDraft: Draft = {
        id: updated.id,
        path: updated.path,
        name: updated.name,
        content: updated.content,
      }
      if (contentRef.current === snapshot) {
        savedRef.current = savedDraft
        setSaved(savedDraft)
        if (updated.content !== snapshot) {
          contentRef.current = updated.content
          draftRef.current = savedDraft
          setDraft(savedDraft)
        }
        setSaveState("saved")
        setRetryable(false)
        setRestoreNote(null)
        forgetDraft(path)
        if (updated.path !== path) forgetDraft(updated.path)
        return true
      }
      const partial: Draft = { ...savedDraft, content: snapshot }
      savedRef.current = partial
      setSaved(partial)
      setSaveState("idle")
      setRetryable(false)
      return true
    } catch (error) {
      if (draftRef.current.path !== path) return false
      const canRetry =
        error instanceof ApiError &&
        (error.status === 0 || error.status >= 500)
      setRetryable(canRetry)
      setSaveError(error instanceof Error ? error.message : "保存失败")
      setSaveState("error")
      return false
    }
  }

  function requestPersist(manual = false): Promise<boolean> {
    manualRef.current = manualRef.current || manual
    if (flightRef.current) {
      rerunRef.current = true
      return flightRef.current
    }
    const flight = (async () => {
      let last = true
      let rounds = 0
      do {
        rounds++
        rerunRef.current = false
        const manualRun = manualRef.current
        manualRef.current = false
        const path = draftRef.current.path
        last = await persistOnce(manualRun)
        if (!last || draftRef.current.path !== path || rounds >= 8) break
      } while (
        rerunRef.current ||
        contentRef.current !== savedRef.current.content
      )
      return last && contentRef.current === savedRef.current.content
    })()
    const settled = flight
      .finally(() => {
        flightRef.current = null
      })
      .then((ok) => {
        if (!rerunRef.current) return ok
        rerunRef.current = false
        return requestPersist(manualRef.current)
      })
    flightRef.current = settled
    return settled
  }

  async function persist() {
    return requestPersist(true)
  }

  async function exportPdf(params: Record<string, TypstInputValue>) {
    const current = { ...draftRef.current, content: contentRef.current }
    if (!current.id || !current.path) {
      setExportError("请先打开一个模板文件。")
      setExportPhase("error")
      return false
    }
    setExportPhase("exporting")
    setExportError(null)
    if (current.content !== savedRef.current.content) {
      const savedOk = await persist()
      if (!savedOk) {
        setExportError("源码尚未保存成功，PDF 未生成。")
        setExportPhase("error")
        return false
      }
    }
    try {
      const result = await generatePdf(draftRef.current.path, params)
      downloadPdf(result.filename, result.contentBase64)
      setExportPhase("done")
      return true
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "生成 PDF 失败")
      setExportPhase("error")
      return false
    }
  }

  function exportWithCurrentInputs() {
    const parsed = parseTypstInputValues(inputs, effectiveInputValues)
    if (!parsed.ok) {
      setExportError(parsed.message)
      setExportPhase("error")
      setVariablesOpen(true)
      return
    }
    void exportPdf(parsed.values)
  }

  function openPdfExport() {
    if (!draftRef.current.id) return
    exportWithCurrentInputs()
  }

  persistRef.current = (manual = false) => {
    void requestPersist(manual)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* ── 顶栏（品牌印记 + 面包屑 + 主交付操作） ───────────────────── */}
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3">
        {/* 左侧：侧栏开关 + 品牌印章 + 面包屑路径 */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <button
            type="button"
            className="btn-pressable hidden size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:flex"
            title={
              sidebarCollapsed ? "展开文件侧栏 (⌘B)" : "收起文件侧栏 (⌘B)"
            }
            aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed((prev) => !prev)}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="size-3.5 transition-transform duration-200" />
            ) : (
              <PanelLeftClose className="size-3.5 transition-transform duration-200" />
            )}
          </button>

          <div className="flex shrink-0 items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-2xs">
              <svg
                className="size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <span className="text-xs font-semibold tracking-tight text-foreground">
              Paperflow
            </span>
            <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-block">
              Studio
            </span>
          </div>

          <div className="h-3.5 w-px shrink-0 bg-border" />

          {/* 面包屑导航（唯一文件名顶部锚点，移除重复保存圆点） */}
          <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            {draft.path ? (
              <>
                {draft.path.includes("/") ? (
                  <span className="hidden max-w-[200px] truncate md:inline">
                    {draft.path.split("/").slice(0, -1).join(" / ")} /
                  </span>
                ) : null}
                <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                  <FileText className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate font-mono text-xs">
                    {draft.name}.typ
                  </span>
                </span>
              </>
            ) : (
              <span className="truncate text-muted-foreground">未打开文稿</span>
            )}
          </div>
        </div>

        {/* 右侧：主题、帮助与朱砂主按钮 */}
        <div className="flex shrink-0 items-center gap-1.5">
          {mounted ? (
            <button
              type="button"
              className="btn-pressable relative flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title={`切换为${resolvedTheme === "dark" ? "日间校样台" : "暗房印务台"} (快捷键 D)`}
              aria-label="切换主题"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              <Sun
                className={cn(
                  "size-3.5 transition-all duration-200",
                  resolvedTheme === "dark"
                    ? "rotate-0 scale-100 opacity-100"
                    : "-rotate-90 scale-0 opacity-0 absolute"
                )}
              />
              <Moon
                className={cn(
                  "size-3.5 transition-all duration-200",
                  resolvedTheme === "dark"
                    ? "rotate-90 scale-0 opacity-0 absolute"
                    : "rotate-0 scale-100 opacity-100"
                )}
              />
            </button>
          ) : null}

          <button
            type="button"
            className="btn-pressable flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            title="快捷键与开发指引"
            aria-label="快捷键与开发指引"
            onClick={() => setHelpOpen(true)}
          >
            <HelpCircle className="size-3.5" />
          </button>

          <div className="hidden h-3.5 w-px bg-border sm:block" />

          <Button
            type="button"
            size="sm"
            className="btn-pressable h-7 gap-1.5 px-3 text-xs shadow-2xs"
            disabled={!draft.id || exportPhase === "exporting"}
            onClick={openPdfExport}
          >
            {exportPhase === "exporting" ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>正在生成…</span>
              </>
            ) : (
              <>
                <Download className="size-3.5" />
                <span>导出 PDF</span>
              </>
            )}
          </Button>
        </div>
      </header>

      {/* ── 移动端三栏切换条 ────────────────────────────────────────── */}
      <div
        className="flex h-9 shrink-0 border-b border-border bg-background lg:hidden"
        role="tablist"
        aria-label="工作区视图"
      >
        {(["files", "source", "preview"] as const).map((id) => (
          <button
            key={id}
            ref={(node) => {
              paneTabRefs.current[id] = node
            }}
            type="button"
            role="tab"
            id={`pane-tab-${id}`}
            aria-selected={pane === id}
            aria-controls={`pane-${id}`}
            tabIndex={pane === id ? 0 : -1}
            className={cn(
              "flex-1 text-xs font-medium transition-colors",
              pane === id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setPane(id)}
            onKeyDown={(event) => handlePaneTabKeyDown(event, id)}
          >
            {id === "files"
              ? "文件"
              : id === "source"
                ? "源码"
                : inputs.length > 0
                  ? `预览 · ${inputs.length} 变量`
                  : "预览"}
          </button>
        ))}
      </div>

      {/* ── 保存冲突拦截提示 ────────────────────────────────────────── */}
      {pendingAction ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-accent px-3 py-2 text-xs text-accent-foreground">
          <p className="font-medium">
            自动保存尚未成功。现在离开，本次修改将会丢失。
          </p>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => setPendingAction(null)}
          >
            留在当前文稿
          </Button>
          <Button
            type="button"
            size="xs"
            variant="destructive"
            onClick={() => {
              const action = pendingAction
              setPendingAction(null)
              action()
            }}
          >
            放弃修改
          </Button>
        </div>
      ) : null}

      {/* ── 主体三栏工作台（侧栏平滑收起展开与双栏顺畅扩展） ───────── */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* 左栏：文件树 */}
        <div
          id="pane-files"
          role="tabpanel"
          aria-labelledby="pane-tab-files"
          style={{
            width: sidebarCollapsed ? 0 : `${layout.sidebarWidth}px`,
            flexBasis: sidebarCollapsed ? 0 : `${layout.sidebarWidth}px`,
          }}
          className={cn(
            "h-full min-h-0 shrink-0 overflow-hidden",
            layout.resizing === "sidebar"
              ? "transition-none select-none"
              : "transition-[width,opacity] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]",
            pane !== "files" && "hidden lg:block",
            sidebarCollapsed
              ? "lg:!w-0 lg:opacity-0 pointer-events-none"
              : "lg:opacity-100"
          )}
        >
          <div
            className="h-full w-full"
            style={{ width: `${layout.sidebarWidth}px` }}
          >
            <FileTree
              ref={fileTreeRef}
              childrenByPath={workspace.children}
              openPaths={workspace.openPaths}
              activeFileId={draft.id}
              unsavedFileId={dirty ? draft.id : null}
              onToggle={workspace.toggle}
              onExpand={workspace.expand}
              onRetryRoot={() => void workspace.reload("")}
              leaveDraft={leaveDraft}
              onOpenFile={(node) => {
                void openFile(node)
              }}
              onCreateDirectory={(parentPath, name) =>
                workspace.addDirectory(parentPath, name)
              }
              onCreateFile={async (parentPath, name) => {
                const opened = await workspace.addFile(
                  parentPath,
                  name,
                  initialTypst(name)
                )
                adopt(draftFrom(opened), "saved")
                return opened
              }}
              onRename={async (node, name) => {
                const updated = await workspace.rename(node, name)
                retarget(node.path, updated.path)
                return updated
              }}
              onDelete={async (node) => {
                await workspace.remove(node)
                forgetDraftTree(node.path)
                forgetInputValuesTree(node.path)
                closeIfUnder(node.path)
              }}
            />
          </div>
        </div>

        {/* 侧栏与编辑器之间的拖拽分割手柄（展开时显示） */}
        {!sidebarCollapsed ? (
          <ResizeHandle
            label="侧边栏宽度"
            isResizing={layout.resizing === "sidebar"}
            onPointerDown={layout.startSidebarResize}
            onDoubleClick={layout.resetSidebarWidth}
            onReset={layout.resetSidebarWidth}
            onStep={(delta, large) =>
              layout.stepSidebarWidth(delta * (large ? 48 : 16))
            }
            valueNow={layout.sidebarWidth}
            valueMin={MIN_SIDEBAR_WIDTH}
            valueMax={MAX_SIDEBAR_WIDTH}
          />
        ) : null}

        {/* 中栏与右栏：源码与预览 */}
        <div
          ref={workspaceSplitRef}
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row",
            pane === "files" && "hidden lg:flex"
          )}
        >
          {/* 中栏：源码编辑器 + 底部图片抽屉 */}
          <section
            id="pane-source"
            role="tabpanel"
            aria-labelledby="pane-tab-source"
            style={{
              width: `${layout.editorRatio * 100}%`,
              flexBasis: `${layout.editorRatio * 100}%`,
            }}
            className={cn(
              "flex h-full min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border-border bg-editor",
              layout.resizing !== null
                ? "transition-none select-none"
                : "transition-[width] duration-200 ease-out",
              layout.resizing !== null && "pointer-events-none",
              pane !== "source" && "hidden lg:flex"
            )}
          >
            {/* 编辑器顶部工具栏（统一 h-10 = 40px 对齐，去重文件名） */}
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-background px-3">
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">源码编辑</span>
                {draft.id ? (
                  <>
                    <div className="h-3.5 w-px bg-border" />
                    <span className="truncate font-mono text-[11px] tabular-nums">
                      {lineCount} 行 · {draft.content.length} 字符
                    </span>
                  </>
                ) : null}
              </div>

              {draft.id ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={cn(
                      "btn-pressable inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                      imagePanelOpen
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    title={
                      imagePanelOpen ? "收起图片资产抽屉" : "展开图片资产抽屉"
                    }
                    aria-label={
                      imagePanelOpen ? "收起图片资产抽屉" : "展开图片资产抽屉"
                    }
                    aria-expanded={imagePanelOpen}
                    onClick={toggleImagePanel}
                  >
                    <ImageIcon className="size-3.5" />
                    <span>图片</span>
                    {fileImages.images.length > 0 ? (
                      <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[11px] tabular-nums text-foreground">
                        {fileImages.images.length}
                      </span>
                    ) : null}
                  </button>

                  <button
                    type="button"
                    className="btn-pressable inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                    title="整理代码缩进与排版 (⌥⇧F / Shift+Alt+F)"
                    disabled={!draft.id || formatting}
                    onClick={formatSource}
                  >
                    {formatting ? (
                      <Loader2 className="size-3.5 animate-spin text-warning" />
                    ) : (
                      <Wand2 className="size-3.5" />
                    )}
                    <span>{formatting ? "格式化中" : "格式化"}</span>
                  </button>
                </div>
              ) : null}
            </div>

            {/* 源码编辑主体 / 引导空状态 */}
            {draft.id ? (
              <SourceEditor
                key={draft.id}
                ref={editorRef}
                value={draft.content}
                diagnostics={effectiveDiagnostics}
                onChange={(content) => {
                  contentRef.current = content
                  const path = draftRef.current.path
                  if (path) {
                    if (content === savedRef.current.content) forgetDraft(path)
                    else rememberDraft(path, content)
                  }
                  setDraft((current) => ({ ...current, content }))
                  setSaveState((state) => (state === "saving" ? state : "idle"))
                  setSaveError(null)
                  setRetryable(false)
                  setFormatError(null)
                }}
                onSave={() => void persist()}
                onFormatActivity={setFormatting}
                onFormatError={setFormatError}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <FileText className="size-4 text-primary" />
                  <span>开始编写 PDF 排版模板</span>
                </h3>
                <p className="mt-2 max-w-[38ch] text-xs leading-relaxed text-muted-foreground">
                  从左侧打开已有 <code className="font-mono text-[11px] text-foreground">.typ</code> 模板，或直接创建含动态变量的结算单示例，体验实时校样与 API 调用。
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="btn-pressable"
                    disabled={creatingSample}
                    onClick={() => void handleCreateSampleTemplate()}
                  >
                    {creatingSample ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    <span>载入结算单示例</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="btn-pressable"
                    onClick={() => void handleStartCreateBlank()}
                  >
                    <FilePlus className="size-3.5" />
                    <span>新建空白模板</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="btn-pressable"
                    onClick={() => setHelpOpen(true)}
                  >
                    <HelpCircle className="size-3.5" />
                    <span>开发指引</span>
                  </Button>
                </div>
              </div>
            )}

            {/* 底部图片资产抽屉（平滑高度伸缩过渡） */}
            {draft.id ? (
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  className="group/handle flex h-4 w-full shrink-0 items-center justify-center border-t border-border bg-editor transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
                  title={imagePanelOpen ? "收起图片资产" : "展开图片资产"}
                  aria-label={imagePanelOpen ? "收起图片资产" : "展开图片资产"}
                  aria-expanded={imagePanelOpen}
                  onClick={toggleImagePanel}
                >
                  <span className="flex h-3.5 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors group-hover/handle:text-foreground">
                    <ChevronUp
                      className={cn(
                        "size-3 transition-transform duration-220 ease-[cubic-bezier(0.16,1,0.3,1)]",
                        imagePanelOpen && "rotate-180"
                      )}
                    />
                  </span>
                </button>

                <div
                  className={cn(
                    "grid transition-[grid-template-rows,opacity] duration-220 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    imagePanelOpen
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  )}
                  aria-hidden={!imagePanelOpen}
                >
                  <div className="min-h-0 overflow-hidden">
                    <ImageBar
                      key={draft.id}
                      images={fileImages.images}
                      phase={fileImages.phase}
                      error={fileImages.error}
                      busy={fileImages.busy}
                      pending={fileImages.pending}
                      disabled={!draft.path}
                      onUpload={fileImages.upload}
                      onDelete={fileImages.remove}
                      onInsert={insertImage}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          {/* 编辑器与预览区之间的拖拽分割手柄 */}
          <ResizeHandle
            label="编辑器与预览区宽度"
            isResizing={layout.resizing === "editor"}
            onPointerDown={(e) =>
              layout.startEditorResize(e, () =>
                workspaceSplitRef.current?.getBoundingClientRect() ?? null
              )
            }
            onDoubleClick={layout.resetEditorRatio}
            onReset={layout.resetEditorRatio}
            onStep={(delta, large) =>
              layout.stepEditorRatio(delta * (large ? 0.05 : 0.02))
            }
            valueNow={Math.round(layout.editorRatio * 100)}
            valueMin={15}
            valueMax={85}
          />

          {/* 右栏：校样纸面预览 + 变量与 API 面板 */}
          <div
            id="pane-preview"
            role="tabpanel"
            aria-labelledby="pane-tab-preview"
            className={cn(
              "h-full min-h-0 min-w-0 flex-1 overflow-hidden",
              layout.resizing !== null && "pointer-events-none select-none",
              pane !== "preview" && "hidden",
              "lg:block"
            )}
          >
            <PreviewPane
              hasFile={draft.id !== null}
              templatePath={draft.path}
              pages={effectivePages}
              phase={effectivePreviewPhase}
              error={effectivePreviewError}
              diagnostics={effectiveDiagnostics}
              note={
                draft.id
                  ? null
                  : "在左侧打开模板或点击「载入结算单示例」，此处将以纯白校样纸实时排出每一页。"
              }
              exportPhase={exportPhase}
              inputs={inputs}
              inputValues={effectiveInputValues}
              variablesOpen={variablesOpen}
              onToggleVariables={toggleVariablesPanel}
              onChangeInputValue={handleChangeInputValue}
              onResetInputDefaults={handleResetInputDefaults}
              onInsertSampleInput={insertSampleInputSnippet}
              onJumpToDiagnostic={handleJumpToDiagnostic}
            />
          </div>
        </div>
      </div>

      {/* ── 底部状态栏（高对比度语义状态 + 与预览统一的编译反馈） ────── */}
      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border bg-sidebar px-3 text-[11px] text-muted-foreground">
        {/* 保存状态 */}
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 font-medium transition-colors duration-150",
            saveState === "saving" && "text-warning",
            saveState === "error" && "text-destructive",
            saveState === "saved" && !dirty && "text-success",
            dirty && saveState !== "saving" && "text-warning"
          )}
        >
          {saveState === "saving" ? (
            <>
              <span className="size-1.5 rounded-full bg-warning motion-safe:animate-pulse" />
              <span>正在保存…</span>
            </>
          ) : saveState === "error" ? (
            <>
              <span className="size-1.5 rounded-full bg-destructive" />
              <span>保存失败</span>
            </>
          ) : saveState === "saved" && !dirty ? (
            <>
              <span className="status-badge-pop size-1.5 rounded-full bg-success" />
              <span>已保存</span>
            </>
          ) : dirty ? (
            <>
              <span className="size-1.5 rounded-full bg-warning" />
              <span>未保存</span>
            </>
          ) : (
            <span>就绪</span>
          )}
        </span>

        {/* 错误或恢复说明 */}
        {saveError ||
        exportError ||
        formatError ||
        restoreNote ||
        (draft.id && draft.name.length > 0 && !nameOk) ? (
          <span
            className={cn(
              "min-w-0 truncate",
              saveError ||
                exportError ||
                formatError ||
                (draft.name.length > 0 && !nameOk)
                ? "font-medium text-destructive"
                : "text-muted-foreground"
            )}
          >
            {saveError ??
              exportError ??
              formatError ??
              (draft.name.length > 0 && !nameOk ? segmentHint : restoreNote)}
          </span>
        ) : null}

        <span className="flex-1" />

        {/* 格式化活动状态 */}
        {formatting ? (
          <span className="flex shrink-0 items-center gap-1 font-medium text-warning">
            <Loader2 className="size-3 animate-spin" />
            <span>正在格式化</span>
          </span>
        ) : null}

        {/* 与预览单一数据源一致的排版状态（可点击跳转至首个诊断位置） */}
        {draft.id ? (
          hasCompileError ? (
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              onClick={() => {
                if (errorDiagnostics[0]) {
                  handleJumpToDiagnostic(errorDiagnostics[0])
                } else {
                  setPane("preview")
                }
              }}
              title="点击定位首个排版错误"
            >
              <AlertCircle className="size-3" />
              <span className="tabular-nums">
                {errorDiagnostics.length > 0
                  ? `${errorDiagnostics.length} 处排版错误`
                  : "排版错误"}
              </span>
            </button>
          ) : warningDiagnostics.length > 0 ? (
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium text-warning transition-colors hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              onClick={() => handleJumpToDiagnostic(warningDiagnostics[0])}
              title="点击定位首个排版警告"
            >
              <AlertTriangle className="size-3" />
              <span className="tabular-nums">
                {warningDiagnostics.length} 条排版警告
              </span>
            </button>
          ) : effectivePreviewPhase === "loading" ? (
            <span className="hidden shrink-0 items-center gap-1 text-muted-foreground sm:inline-flex">
              <Loader2 className="size-3 animate-spin" />
              <span>正在排版</span>
            </span>
          ) : effectivePreviewPhase === "ready" ? (
            <span className="hidden shrink-0 items-center gap-1 font-medium text-success sm:inline-flex">
              <CheckCircle2 className="size-3" />
              <span>排版正常</span>
            </span>
          ) : null
        ) : null}

        <div className="hidden h-3 w-px bg-border sm:block" />

        {/* 快捷键提示（对比度 ≥ 6.4:1） */}
        <span className="hidden shrink-0 text-muted-foreground md:inline">
          ⌘S 保存 · ⌘I 模板变量 · ⌥⇧F 格式化 · D 主题
        </span>
      </footer>

      {/* 帮助指南弹窗 */}
      {helpOpen ? <HelpDialog onClose={() => setHelpOpen(false)} /> : null}
    </div>
  )
}
