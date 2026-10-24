"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import {
  clampEditorRatio,
  clampSidebarWidth,
  DEFAULT_EDITOR_RATIO,
  DEFAULT_SIDEBAR_WIDTH,
  defaultStudioLayout,
  getLayoutSnapshot,
  MIN_EDITOR_PIXELS,
  MIN_EDITOR_RATIO,
  MIN_PREVIEW_PIXELS,
  MAX_EDITOR_RATIO,
  rememberStudioLayout,
  subscribeLayout,
} from "@/lib/studio/layout-storage"

export type ActiveResizer = "sidebar" | "editor" | null

export function useStudioLayout() {
  const stored = useSyncExternalStore(
    subscribeLayout,
    getLayoutSnapshot,
    () => defaultStudioLayout
  )

  const [resizing, setResizing] = useState<ActiveResizer>(null)
  const [dragSidebarWidth, setDragSidebarWidth] = useState<number | null>(null)
  const [dragEditorRatio, setDragEditorRatio] = useState<number | null>(null)

  const sidebarWidth = dragSidebarWidth ?? stored.sidebarWidth
  const editorRatio = dragEditorRatio ?? stored.editorRatio

  const sidebarWidthRef = useRef(sidebarWidth)
  const editorRatioRef = useRef(editorRatio)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  useEffect(() => {
    editorRatioRef.current = editorRatio
  }, [editorRatio])

  // 调整中锁定鼠标光标与禁止文字选中
  useEffect(() => {
    if (!resizing) return

    const originalCursor = document.body.style.cursor
    const originalUserSelect = document.body.style.userSelect

    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    return () => {
      document.body.style.cursor = originalCursor
      document.body.style.userSelect = originalUserSelect
    }
  }, [resizing])

  // 启动侧栏拖拽
  const startSidebarResize = useCallback(
    (e: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
      if (e.button !== 0) return

      e.preventDefault()
      e.stopPropagation()

      isDraggingRef.current = true
      setResizing("sidebar")

      const startX = e.clientX
      const initialWidth = sidebarWidthRef.current
      let latestWidth = initialWidth

      const handleMove = (event: MouseEvent | PointerEvent) => {
        if (!isDraggingRef.current) return
        const delta = event.clientX - startX
        const nextWidth = clampSidebarWidth(initialWidth + delta)
        latestWidth = nextWidth
        setDragSidebarWidth(nextWidth)
      }

      const handleUp = () => {
        if (!isDraggingRef.current) return
        isDraggingRef.current = false
        setResizing(null)
        setDragSidebarWidth(null)

        window.removeEventListener("pointermove", handleMove)
        window.removeEventListener("pointerup", handleUp)
        window.removeEventListener("pointercancel", handleUp)
        window.removeEventListener("mousemove", handleMove)
        window.removeEventListener("mouseup", handleUp)

        rememberStudioLayout({ sidebarWidth: latestWidth })
      }

      window.addEventListener("pointermove", handleMove, { passive: true })
      window.addEventListener("pointerup", handleUp)
      window.addEventListener("pointercancel", handleUp)
      window.addEventListener("mousemove", handleMove, { passive: true })
      window.addEventListener("mouseup", handleUp)
    },
    []
  )

  // 启动编辑器与预览区拖拽
  const startEditorResize = useCallback(
    (
      e: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>,
      getContainerRect: () => DOMRect | null
    ) => {
      if (e.button !== 0) return

      e.preventDefault()
      e.stopPropagation()

      const containerRect = getContainerRect()
      if (!containerRect || containerRect.width <= 0) return

      isDraggingRef.current = true
      setResizing("editor")

      const containerLeft = containerRect.left
      const containerWidth = containerRect.width
      let latestRatio = editorRatioRef.current

      const minRatio = Math.max(
        MIN_EDITOR_RATIO,
        MIN_EDITOR_PIXELS / containerWidth
      )
      const maxRatio = Math.min(
        MAX_EDITOR_RATIO,
        (containerWidth - MIN_PREVIEW_PIXELS) / containerWidth
      )

      const handleMove = (event: MouseEvent | PointerEvent) => {
        if (!isDraggingRef.current) return
        const relativeX = event.clientX - containerLeft
        const rawRatio = relativeX / containerWidth
        const nextRatio = Math.min(Math.max(rawRatio, minRatio), maxRatio)
        latestRatio = nextRatio
        setDragEditorRatio(nextRatio)
      }

      const handleUp = () => {
        if (!isDraggingRef.current) return
        isDraggingRef.current = false
        setResizing(null)
        setDragEditorRatio(null)

        window.removeEventListener("pointermove", handleMove)
        window.removeEventListener("pointerup", handleUp)
        window.removeEventListener("pointercancel", handleUp)
        window.removeEventListener("mousemove", handleMove)
        window.removeEventListener("mouseup", handleUp)

        rememberStudioLayout({ editorRatio: latestRatio })
      }

      window.addEventListener("pointermove", handleMove, { passive: true })
      window.addEventListener("pointerup", handleUp)
      window.addEventListener("pointercancel", handleUp)
      window.addEventListener("mousemove", handleMove, { passive: true })
      window.addEventListener("mouseup", handleUp)
    },
    []
  )

  // 双击或快捷重置
  const resetSidebarWidth = useCallback(() => {
    setDragSidebarWidth(null)
    rememberStudioLayout({ sidebarWidth: DEFAULT_SIDEBAR_WIDTH })
  }, [])

  const resetEditorRatio = useCallback(() => {
    setDragEditorRatio(null)
    rememberStudioLayout({ editorRatio: DEFAULT_EDITOR_RATIO })
  }, [])

  // 键盘微调步进
  const stepSidebarWidth = useCallback((deltaPx: number) => {
    const next = clampSidebarWidth(sidebarWidthRef.current + deltaPx)
    rememberStudioLayout({ sidebarWidth: next })
  }, [])

  const stepEditorRatio = useCallback((deltaRatio: number) => {
    const next = clampEditorRatio(editorRatioRef.current + deltaRatio)
    rememberStudioLayout({ editorRatio: next })
  }, [])

  return {
    sidebarWidth,
    editorRatio,
    resizing,
    startSidebarResize,
    startEditorResize,
    resetSidebarWidth,
    resetEditorRatio,
    stepSidebarWidth,
    stepEditorRatio,
  }
}
