"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface ResizeHandleProps {
  label: string
  isResizing?: boolean
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onDoubleClick?: () => void
  onStep?: (delta: number, large?: boolean) => void
  onReset?: () => void
  className?: string
  valueNow?: number
  valueMin?: number
  valueMax?: number
}

export function ResizeHandle({
  label,
  isResizing = false,
  onPointerDown,
  onDoubleClick,
  onStep,
  onReset,
  className,
  valueNow,
  valueMin,
  valueMax,
}: ResizeHandleProps) {
  const lastClickRef = React.useRef<{ time: number; x: number; y: number }>({
    time: 0,
    x: 0,
    y: 0,
  })

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return

    const now = Date.now()
    const last = lastClickRef.current
    const isQuickSecondClick =
      now - last.time < 350 &&
      Math.abs(e.clientX - last.x) < 6 &&
      Math.abs(e.clientY - last.y) < 6

    lastClickRef.current = { time: now, x: e.clientX, y: e.clientY }

    if (isQuickSecondClick) {
      e.preventDefault()
      e.stopPropagation()
      onReset?.()
      onDoubleClick?.()
      return
    }

    onPointerDown(e)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const isLarge = e.shiftKey
    if (e.key === "ArrowLeft") {
      e.preventDefault()
      onStep?.(-1, isLarge)
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      onStep?.(1, isLarge)
    } else if (e.key === "Enter" || e.key === "Home" || e.key === " ") {
      e.preventDefault()
      onReset?.()
    }
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={valueNow}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      title={`${label}（按住拖拽调节宽度，双击恢复默认）`}
      onPointerDown={handlePointerDown}
      onDoubleClick={onDoubleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "group/handle relative z-30 hidden h-full w-2.5 shrink-0 -mx-1.25 cursor-col-resize select-none touch-none items-center justify-center lg:flex",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        isResizing && "z-50",
        className
      )}
    >
      {/* 居中 1px 分割线 */}
      <div
        className={cn(
          "pointer-events-none h-full w-px transition-colors duration-150",
          isResizing
            ? "bg-primary shadow-xs"
            : "bg-border group-hover/handle:bg-primary/70 group-focus-visible/handle:bg-primary"
        )}
      />

      {/* 居中拖拽触点手柄（在 hover 或拖拽时柔和浮现） */}
      <div
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 z-40 rounded-full px-0.5 py-1.5 transition-[transform,opacity] duration-150",
          isResizing
            ? "scale-100 bg-primary/20 opacity-100"
            : "scale-90 opacity-0 group-hover/handle:scale-100 group-hover/handle:opacity-100"
        )}
      >
        <div
          className={cn(
            "h-4 w-0.5 rounded-full transition-colors",
            isResizing ? "bg-primary" : "bg-primary/80"
          )}
        />
      </div>
    </div>
  )
}
