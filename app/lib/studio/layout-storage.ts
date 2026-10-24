/**
 * Paperflow 工作台布局配置与本地持久化
 */

export const DEFAULT_SIDEBAR_WIDTH = 248 // 15.5rem 默认侧栏宽度
export const MIN_SIDEBAR_WIDTH = 160
export const MAX_SIDEBAR_WIDTH = 520

export const DEFAULT_EDITOR_RATIO = 0.465 // 约 1 : 1.15 的中右栏默认分割比例
export const MIN_EDITOR_RATIO = 0.15
export const MAX_EDITOR_RATIO = 0.85

export const MIN_EDITOR_PIXELS = 240
export const MIN_PREVIEW_PIXELS = 280

export type StudioLayoutState = {
  sidebarWidth: number
  editorRatio: number
}

export const defaultStudioLayout: StudioLayoutState = {
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  editorRatio: DEFAULT_EDITOR_RATIO,
}

const storageKey = "paper-flow.studio.layout"

export function clampSidebarWidth(width: number): number {
  if (typeof width !== "number" || Number.isNaN(width)) {
    return DEFAULT_SIDEBAR_WIDTH
  }
  return Math.min(Math.max(Math.round(width), MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH)
}

export function clampEditorRatio(ratio: number): number {
  if (typeof ratio !== "number" || Number.isNaN(ratio)) {
    return DEFAULT_EDITOR_RATIO
  }
  return Math.min(Math.max(ratio, MIN_EDITOR_RATIO), MAX_EDITOR_RATIO)
}

const listeners = new Set<() => void>()

export function subscribeLayout(callback: () => void): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

let cachedSnapshot: StudioLayoutState = defaultStudioLayout
let cachedRaw: string | null = null

/**
 * 带有引用缓存的快照获取，符合 useSyncExternalStore 规范
 */
export function getLayoutSnapshot(): StudioLayoutState {
  if (typeof window === "undefined") {
    return defaultStudioLayout
  }
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw === cachedRaw) {
      return cachedSnapshot
    }
    cachedRaw = raw
    cachedSnapshot = recallStudioLayout()
    return cachedSnapshot
  } catch {
    return defaultStudioLayout
  }
}

/**
 * 从本地存储中恢复工作台布局
 */
export function recallStudioLayout(): StudioLayoutState {
  if (typeof window === "undefined") {
    return { ...defaultStudioLayout }
  }
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      return { ...defaultStudioLayout }
    }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") {
      return { ...defaultStudioLayout }
    }
    const obj = parsed as Record<string, unknown>
    const sidebarWidth =
      typeof obj.sidebarWidth === "number"
        ? clampSidebarWidth(obj.sidebarWidth)
        : DEFAULT_SIDEBAR_WIDTH
    const editorRatio =
      typeof obj.editorRatio === "number"
        ? clampEditorRatio(obj.editorRatio)
        : DEFAULT_EDITOR_RATIO

    return { sidebarWidth, editorRatio }
  } catch {
    return { ...defaultStudioLayout }
  }
}

/**
 * 保存工作台布局到本地存储并通知订阅者
 */
export function rememberStudioLayout(patch: Partial<StudioLayoutState>): void {
  if (typeof window === "undefined") {
    return
  }
  try {
    const current = recallStudioLayout()
    const next: StudioLayoutState = {
      sidebarWidth:
        patch.sidebarWidth !== undefined
          ? clampSidebarWidth(patch.sidebarWidth)
          : current.sidebarWidth,
      editorRatio:
        patch.editorRatio !== undefined
          ? clampEditorRatio(patch.editorRatio)
          : current.editorRatio,
    }
    const serialized = JSON.stringify(next)
    window.localStorage.setItem(storageKey, serialized)
    cachedRaw = serialized
    cachedSnapshot = next
    listeners.forEach((listener) => listener())
  } catch {
    // 忽略 localStorage 配额错误等异常
  }
}
