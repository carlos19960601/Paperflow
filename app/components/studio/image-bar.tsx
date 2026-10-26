"use client"

import { useEffect, useRef, useState, type Ref } from "react"
import { Image as ImageIcon, Pencil, Trash2, Upload } from "lucide-react"
import { segmentHint, validSegment } from "@/lib/org/names"
import type { ImagePending, LoadedImage } from "@/components/studio/use-file-images"

type ImageBarProps = {
  images: LoadedImage[]
  phase: "idle" | "loading" | "ready" | "error"
  error: string | null
  busy: boolean
  pending: ImagePending
  disabled: boolean
  referenceCounts: Record<string, number>
  onUpload: (files: File[]) => Promise<void>
  onDelete: (name: string) => Promise<void>
  onRename: (name: string, newStem: string) => Promise<void>
  onInsert: (name: string) => void
}

export function ImageBar({
  images, phase, error, busy, pending, disabled, referenceCounts,
  onUpload, onDelete, onRename, onInsert,
}: ImageBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const thumbRefs = useRef(new Map<string, HTMLButtonElement>())
  const [hovered, setHovered] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const [roving, setRoving] = useState<string | null>(null)
  const [confirmName, setConfirmName] = useState<string | null>(null)
  const [renameName, setRenameName] = useState<string | null>(null)

  const activeName = focused ?? hovered
  const uploadLabel =
    pending?.kind === "upload"
      ? `正在上传 ${pending.done + 1}/${pending.total}`
      : null
  const rovingName =
    roving && images.some((image) => image.name === roving)
      ? roving
      : (images[0]?.name ?? null)

  const effectiveConfirmName =
    confirmName && images.some((image) => image.name === confirmName)
      ? confirmName
      : null

  const effectiveRenameName =
    renameName && images.some((image) => image.name === renameName)
      ? renameName
      : null

  function focusThumb(name: string) {
    setRoving(name); setConfirmName(null); setRenameName(null)
    thumbRefs.current.get(name)?.focus()
  }

  function cancelConfirm() {
    const name = effectiveConfirmName; setConfirmName(null)
    if (name) thumbRefs.current.get(name)?.focus()
  }

  function cancelRename() {
    const name = effectiveRenameName; setRenameName(null)
    if (name) thumbRefs.current.get(name)?.focus()
  }

  async function handleRename(name: string, newStem: string) {
    try {
      await onRename(name, newStem)
      setRenameName(null)
    } catch {
      // 保持重命名模式，错误已由 use-file-images 写入 error
    }
  }

  function moveThumb(name: string, delta: number) {
    const index = images.findIndex((image) => image.name === name)
    const next = images[index + delta]
    if (next) focusThumb(next.name)
  }

  return (
    <div className="min-w-0 shrink-0 border-b border-border/50 bg-background/50 px-3 pt-1.5 pb-2" role="toolbar" aria-label="图片">
      <div className="flex min-h-12 items-center gap-2.5">
        <button
          type="button"
          className="btn-pressable inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border/80 bg-background px-2.5 text-xs font-medium text-foreground shadow-2xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
          disabled={disabled || busy}
          aria-busy={pending?.kind === "upload"}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-3.5" />
          <span>上传图片</span>
        </button>
        <input ref={inputRef} type="file" multiple
          accept=".png,.jpg,.jpeg,.gif,.webp,.svg,image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          className="sr-only" tabIndex={-1} aria-label="上传图片，可以一次选择多张"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            event.target.value = ""
            if (files.length > 0) void onUpload(files)
          }} />
        {phase === "loading" ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <span key={i} className="size-10 shrink-0 rounded-md bg-muted motion-safe:animate-pulse" />
            ))}
          </div>
        ) : null}
        {uploadLabel && images.length === 0 ? (
          <p aria-live="polite" className="min-w-0 flex-1 text-xs leading-6 text-muted-foreground">
            {uploadLabel}
          </p>
        ) : null}
        {!uploadLabel && images.length === 0 && error ? (
          <p role="alert" className="min-w-0 flex-1 truncate text-xs text-destructive">{error}</p>
        ) : null}
        {!uploadLabel && phase === "ready" && images.length === 0 && !error ? (
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
            暂无图片资源。点击上传后，轻点缩略图即可将 <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">#image(...)</code> 插入源码。
          </p>
        ) : null}
        {images.length > 0 ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1">
            {images.map((image) => (
              <ImageThumb key={image.name} image={image}
                tabIndex={rovingName === image.name ? 0 : -1}
                busy={busy}
                waiting={pending?.kind === "delete" && pending.name === image.name}
                confirming={effectiveConfirmName === image.name}
                renaming={effectiveRenameName === image.name}
                submitting={pending?.kind === "rename" && pending.name === image.name}
                referenceCount={referenceCounts[image.name] ?? 0}
                confirmRef={effectiveConfirmName === image.name ? confirmRef : undefined}
                buttonRef={(node) => { if (node) thumbRefs.current.set(image.name, node); else thumbRefs.current.delete(image.name) }}
                onPoint={(inside) => setHovered(inside ? image.name : (current) => current === image.name ? null : current)}
                onFocusChange={(inside) => setFocused(inside ? image.name : (current) => current === image.name ? null : current)}
                onInsert={() => { setConfirmName(null); setRenameName(null); onInsert(image.name) }}
                onAskDelete={() => { if (!busy) { setConfirmName(image.name); setRenameName(null) } }}
                onAskRename={() => { if (!busy) { setRenameName(image.name); setConfirmName(null) } }}
                onCancelDelete={cancelConfirm}
                onCancelRename={cancelRename}
                onRename={(newStem) => void handleRename(image.name, newStem)}
                onArrow={(d) => moveThumb(image.name, d)}
                onHome={() => { if (images[0]) focusThumb(images[0].name) }}
                onEnd={() => { const last = images[images.length - 1]; if (last) focusThumb(last.name) }}
                onDelete={() => void onDelete(image.name)}
              />
            ))}
          </div>
        ) : null}
      </div>
      {images.length > 0 || phase === "loading" ? (
        <div className="flex h-5 items-center">
          {error && images.length > 0 ? (
            <p role="alert" className="min-w-0 flex-1 truncate text-xs text-destructive">{error}</p>
          ) : (
            <p aria-live={uploadLabel ? "polite" : undefined}
              className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {uploadLabel ?? activeName ?? effectiveConfirmName ?? effectiveRenameName ?? "\u00a0"}
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function stemOf(name: string) {
  const index = name.lastIndexOf(".")
  return index > 0 ? name.slice(0, index) : name
}

function ImageThumb({
  image, tabIndex, busy, waiting, confirming, renaming, submitting,
  referenceCount, confirmRef, buttonRef,
  onPoint, onFocusChange, onInsert, onAskDelete, onAskRename,
  onCancelDelete, onCancelRename, onRename, onDelete,
  onArrow, onHome, onEnd,
}: {
  image: LoadedImage; tabIndex: number; busy: boolean; waiting: boolean
  confirming: boolean; renaming: boolean; submitting: boolean
  referenceCount: number
  confirmRef?: Ref<HTMLButtonElement>
  buttonRef: (node: HTMLButtonElement | null) => void
  onPoint: (inside: boolean) => void
  onFocusChange: (inside: boolean) => void
  onInsert: () => void; onAskDelete: () => void; onAskRename: () => void
  onCancelDelete: () => void; onCancelRename: () => void
  onRename: (newStem: string) => void; onDelete: () => void
  onArrow: (delta: number) => void; onHome: () => void; onEnd: () => void
}) {
  const url = useObjectUrl(image.bytes, image.contentType, image.name)
  return (
    <div
      className="group/thumb relative flex shrink-0 items-center rounded-md border border-border/80 bg-card p-1 shadow-2xs transition-all hover:border-foreground/30 hover:shadow-xs"
      onMouseEnter={() => onPoint(true)}
      onMouseLeave={() => onPoint(false)}
      onFocus={() => onFocusChange(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          onFocusChange(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        tabIndex={tabIndex}
        disabled={waiting}
        aria-label={`插入 ${image.name}`}
        title={`点击插入 ${image.name}`}
        className="size-10 shrink-0 overflow-hidden rounded bg-paper-well transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
        onClick={onInsert}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault()
            onArrow(1)
          } else if (event.key === "ArrowLeft") {
            event.preventDefault()
            onArrow(-1)
          } else if (event.key === "Home") {
            event.preventDefault()
            onHome()
          } else if (event.key === "End") {
            event.preventDefault()
            onEnd()
          } else if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault()
            onAskDelete()
          }
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" src={url} className="size-full object-contain" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-4" />
          </div>
        )}
      </button>

      {!confirming && !renaming && !busy ? (
        <>
          <button
            type="button"
            aria-label={`重命名 ${image.name}`}
            title="重命名"
            className="ml-1 flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 pointer-coarse:size-10"
            onClick={(e) => {
              e.stopPropagation()
              onAskRename()
            }}
          >
            <Pencil className="size-3 pointer-coarse:size-4" />
          </button>
          <button
            type="button"
            aria-label={`删除 ${image.name}`}
            title="删除"
            className="ml-1 flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 pointer-coarse:size-10"
            onClick={(e) => {
              e.stopPropagation()
              onAskDelete()
            }}
          >
            <Trash2 className="size-3 pointer-coarse:size-4" />
          </button>
        </>
      ) : null}

      {confirming ? (
        <div className="flex shrink-0 items-center gap-1 pl-1 text-[11px]">
          <span
            className="whitespace-nowrap text-foreground font-medium"
            title={referenceCount > 0 ? "删除后当前模板预览与导出 PDF 将失败" : undefined}
          >
            {referenceCount > 0 ? `被引用 ${referenceCount} 处，仍删除？` : "确认删除？"}
          </span>
          <button
            ref={confirmRef}
            type="button"
            className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive font-medium hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
            disabled={busy}
            onClick={onDelete}
          >
            删除
          </button>
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none"
            onClick={onCancelDelete}
          >
            取消
          </button>
        </div>
      ) : null}

      {renaming ? (
        <RenameForm
          initialStem={stemOf(image.name)}
          submitting={submitting}
          onSubmit={onRename}
          onCancel={onCancelRename}
        />
      ) : null}
    </div>
  )
}

function RenameForm({
  initialStem,
  submitting,
  onSubmit,
  onCancel,
}: {
  initialStem: string
  submitting: boolean
  onSubmit: (stem: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialStem)
  const ok = validSegment(value)
  return (
    <form
      className="flex shrink-0 items-center gap-1 pl-1"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ok || submitting) return
        onSubmit(value.trim())
      }}
    >
      <input
        className="h-6 w-24 rounded border border-border bg-card px-1.5 text-[11px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35"
        value={value}
        maxLength={64}
        autoFocus
        aria-label="重命名图片"
        aria-invalid={!ok}
        title={segmentHint}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onCancel()
          }
        }}
      />
      <button
        type="submit"
        className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
        disabled={submitting || !ok}
      >
        {submitting ? "重命名中" : "重命名"}
      </button>
      <button
        type="button"
        className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none"
        disabled={submitting}
        onClick={onCancel}
      >
        取消
      </button>
    </form>
  )
}

function useObjectUrl(bytes: Uint8Array, contentType: string, name: string) {
  const type = contentType || mimeFor(name)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const copy = new Uint8Array(bytes)
    const next = URL.createObjectURL(new Blob([copy], { type }))
    queueMicrotask(() => {
      if (active) setUrl(next)
    })
    return () => {
      active = false
      URL.revokeObjectURL(next)
    }
  }, [bytes, type])
  return url
}

function mimeFor(name: string) {
  const ext = name.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "png": return "image/png"
    case "jpg": case "jpeg": return "image/jpeg"
    case "gif": return "image/gif"
    case "webp": return "image/webp"
    case "svg": return "image/svg+xml"
    default: return "application/octet-stream"
  }
}
