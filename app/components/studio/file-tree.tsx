"use client"

import {
  createContext,
  forwardRef,
  useContext,
  useImperativeHandle,
  useState,
} from "react"
import {
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  RotateCw,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type { NodeBucket } from "@/components/studio/use-workspace"
import type { TypstFile, TypstNode } from "@/lib/api/types"
import {
  fileStem,
  parentPath,
  replacePathPrefix,
  validFileStem,
} from "@/lib/org/files"
import { segmentHint, validSegment } from "@/lib/org/names"
import { cn } from "@/lib/utils"

const fieldClass =
  "h-7 w-full rounded-md border border-input bg-card px-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35"

type Composer = { kind: "dir" | "file"; parentPath: string }
type FocusNode = { kind: "dir" | "file"; path: string }

export type FileTreeHandle = {
  startCreateFile: () => void
}

type FileTreeProps = {
  className?: string
  childrenByPath: Record<string, NodeBucket>
  openPaths: string[]
  activeFileId: number | null
  unsavedFileId: number | null
  onToggle: (path: string) => void
  onExpand: (path: string) => void
  onRetryRoot: () => void
  leaveDraft: (action: () => void) => void
  onOpenFile: (node: TypstNode) => void
  onCreateDirectory: (parentPath: string, name: string) => Promise<TypstNode>
  onCreateFile: (parentPath: string, name: string) => Promise<TypstFile>
  onRename: (node: TypstNode, name: string) => Promise<TypstNode>
  onDelete: (node: TypstNode) => Promise<void>
}

type TreeContextValue = FileTreeProps & {
  focus: FocusNode | null
  composer: Composer | null
  onFocus: (node: FocusNode) => void
  onComposer: (composer: Composer | null) => void
}

const TreeContext = createContext<TreeContextValue | null>(null)

function useTree() {
  const value = useContext(TreeContext)
  if (!value) throw new Error("文件树尚未就绪")
  return value
}

function ordered(items: TypstNode[]) {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1
    return a.name.localeCompare(b.name, "zh-CN")
  })
}

function destination(focus: FocusNode | null) {
  if (!focus) return ""
  return focus.kind === "dir" ? focus.path : parentPath(focus.path)
}

export const FileTree = forwardRef<FileTreeHandle, FileTreeProps>(
  function FileTree(props, ref) {
    const [composer, setComposer] = useState<Composer | null>(null)
    const [focus, setFocus] = useState<FocusNode | null>(null)
    const root = props.childrenByPath[""] ?? {
      state: "loading" as const,
      error: null,
      items: [],
    }

    function begin(next: Composer) {
      setComposer(next)
      if (next.parentPath) props.onExpand(next.parentPath)
    }

    useImperativeHandle(
      ref,
      () => ({
        startCreateFile() {
          props.leaveDraft(() =>
            begin({ kind: "file", parentPath: destination(focus) })
          )
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [focus, props.leaveDraft]
    )

    async function rename(node: TypstNode, name: string) {
      const updated = await props.onRename(node, name)
      setFocus((current) =>
        current &&
        (current.path === node.path || current.path.startsWith(`${node.path}/`))
          ? {
              ...current,
              path: replacePathPrefix(current.path, node.path, updated.path),
            }
          : current
      )
      setComposer((current) =>
        current
          ? {
              ...current,
              parentPath: replacePathPrefix(
                current.parentPath,
                node.path,
                updated.path
              ),
            }
          : current
      )
      return updated
    }

    async function remove(node: TypstNode) {
      await props.onDelete(node)
      setFocus((current) =>
        current &&
        (current.path === node.path || current.path.startsWith(`${node.path}/`))
          ? null
          : current
      )
      setComposer((current) =>
        current &&
        (current.parentPath === node.path ||
          current.parentPath.startsWith(`${node.path}/`))
          ? null
          : current
      )
    }

    const rootComposing = composer?.parentPath === ""

    return (
      <TreeContext.Provider
        value={{
          ...props,
          onRename: rename,
          onDelete: remove,
          focus,
          composer,
          onFocus: setFocus,
          onComposer: setComposer,
        }}
      >
        <aside
          className={cn(
            "flex h-full min-h-0 min-w-0 flex-col border-border bg-sidebar",
            props.className
          )}
          aria-label="文件"
        >
          {/* 顶部工具栏（统一 h-10 = 40px 对齐） */}
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
            <span className="text-xs font-medium text-muted-foreground">
              文件资源
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className="btn-pressable flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                title="新建模板文件"
                aria-label="新建文件"
                onClick={() => {
                  props.leaveDraft(() =>
                    begin({ kind: "file", parentPath: destination(focus) })
                  )
                }}
              >
                <FilePlus className="size-3.5" />
              </button>
              <button
                type="button"
                className="btn-pressable flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                title="新建目录"
                aria-label="新建目录"
                onClick={() => {
                  props.leaveDraft(() =>
                    begin({ kind: "dir", parentPath: destination(focus) })
                  )
                }}
              >
                <FolderPlus className="size-3.5" />
              </button>
              <button
                type="button"
                className="btn-pressable flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                title="重新载入文件树"
                aria-label="重新载入工作区"
                onClick={props.onRetryRoot}
              >
                <RotateCw className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-1.5 py-1.5 pb-4">
            {root.state === "loading" && root.items.length === 0 ? (
              <div className="grid gap-2 px-1.5 py-2" aria-hidden="true">
                <div className="h-7 rounded-md bg-muted motion-safe:animate-pulse" />
                <div className="h-7 w-4/5 rounded-md bg-muted motion-safe:animate-pulse" />
                <div className="h-7 w-3/5 rounded-md bg-muted motion-safe:animate-pulse" />
              </div>
            ) : null}
            {root.error && root.items.length === 0 ? (
              <div className="grid gap-2 px-1.5 py-2">
                <p role="alert" className="text-xs text-destructive">
                  {root.error}
                </p>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={props.onRetryRoot}
                >
                  重试
                </Button>
              </div>
            ) : null}
            {root.state === "ready" &&
            root.items.length === 0 &&
            !rootComposing ? (
              <div className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
                暂无模板文件。点击右上角加号新建目录或 <code className="font-mono text-[11px] text-foreground">.typ</code> 模板。
              </div>
            ) : null}
            {root.state === "loading" && root.items.length === 0 ? null : (
              <NodeList parentPath="" depth={0} />
            )}
          </div>
        </aside>
      </TreeContext.Provider>
    )
  }
)

function NodeList({
  parentPath,
  depth,
}: {
  parentPath: string
  depth: number
}) {
  const tree = useTree()
  const bucket = tree.childrenByPath[parentPath]
  const items = ordered(bucket?.items ?? [])
  const composing = tree.composer?.parentPath === parentPath
  const state = bucket?.state ?? "idle"
  const isRoot = parentPath === ""

  return (
    <ul
      className={cn(
        "grid w-full min-w-0 grid-cols-1 gap-0.5",
        depth > 0 && "pt-0.5"
      )}
    >
      {composing && tree.composer ? (
        <li>
          <NameEntry
            depth={depth}
            placeholder={
              tree.composer.kind === "dir" ? "目录名称" : "模板文件名称"
            }
            submitLabel={
              tree.composer.kind === "dir" ? "创建目录" : "创建模板"
            }
            file={tree.composer.kind === "file"}
            onCancel={() => tree.onComposer(null)}
            onSubmit={async (name) => {
              if (tree.composer?.kind === "dir") {
                const created = await tree.onCreateDirectory(parentPath, name)
                tree.onFocus({ kind: "dir", path: created.path })
              } else {
                const created = await tree.onCreateFile(parentPath, name)
                tree.onFocus({ kind: "file", path: created.path })
              }
              tree.onComposer(null)
            }}
          />
        </li>
      ) : null}
      {!isRoot && state === "loading" && items.length === 0 ? (
        <li
          className="py-1 text-xs text-muted-foreground"
          style={{ paddingLeft: `${20 + depth * 16}px` }}
        >
          正在读取…
        </li>
      ) : null}
      {bucket?.error && !(isRoot && items.length === 0) ? (
        <li
          role="alert"
          className="py-1 text-xs text-destructive"
          style={{ paddingLeft: `${20 + depth * 16}px` }}
        >
          {bucket.error}
        </li>
      ) : null}
      {items.map((node) =>
        node.kind === "dir" ? (
          <DirNode key={node.id} node={node} depth={depth} />
        ) : (
          <FileNode key={node.id} node={node} depth={depth} />
        )
      )}
      {!isRoot && state === "ready" && items.length === 0 && !composing ? (
        <li
          className="py-1 text-xs leading-5 text-muted-foreground"
          style={{ paddingLeft: `${20 + depth * 16}px` }}
        >
          空目录
        </li>
      ) : null}
    </ul>
  )
}

function DirNode({ node, depth }: { node: TypstNode; depth: number }) {
  const tree = useTree()
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle")
  const open = tree.openPaths.includes(node.path)
  const selected = tree.focus?.kind === "dir" && tree.focus.path === node.path

  return (
    <li>
      {mode === "rename" ? (
        <NameEntry
          depth={depth}
          placeholder="目录名称"
          submitLabel="重命名"
          initial={node.name}
          onCancel={() => setMode("idle")}
          onSubmit={async (name) => {
            await tree.onRename(node, name)
            setMode("idle")
          }}
        />
      ) : mode === "delete" ? (
        <div style={{ paddingLeft: `${6 + depth * 14}px` }}>
          <ConfirmDelete
            label={node.name}
            onCancel={() => setMode("idle")}
            onConfirm={() => tree.onDelete(node)}
          />
        </div>
      ) : (
        <TreeRow
          depth={depth}
          label={node.name}
          kind="dir"
          open={open}
          selected={selected}
          onOpen={() => {
            tree.onFocus({ kind: "dir", path: node.path })
            tree.onToggle(node.path)
          }}
          onRename={() => setMode("rename")}
          onDelete={() => setMode("delete")}
        />
      )}
      {open && mode === "idle" ? (
        <NodeList parentPath={node.path} depth={depth + 1} />
      ) : null}
    </li>
  )
}

function FileNode({ node, depth }: { node: TypstNode; depth: number }) {
  const tree = useTree()
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle")
  const selected = tree.activeFileId === node.id
  const unsaved = tree.unsavedFileId === node.id

  if (mode === "rename") {
    return (
      <li>
        <NameEntry
          depth={depth}
          placeholder="模板文件名称"
          submitLabel="重命名"
          initial={node.name}
          file
          onCancel={() => setMode("idle")}
          onSubmit={async (name) => {
            await tree.onRename(node, name)
            setMode("idle")
          }}
        />
      </li>
    )
  }
  if (mode === "delete") {
    return (
      <li style={{ paddingLeft: `${6 + depth * 14}px` }}>
        <ConfirmDelete
          label={`${node.name}.typ`}
          note={unsaved ? "尚未保存成功的修改会一并丢弃。" : undefined}
          onCancel={() => setMode("idle")}
          onConfirm={() => tree.onDelete(node)}
        />
      </li>
    )
  }
  return (
    <li>
      <TreeRow
        depth={depth}
        label={node.name}
        kind="file"
        selected={selected}
        unsaved={unsaved}
        onOpen={() => {
          tree.onFocus({ kind: "file", path: node.path })
          if (node.id === tree.activeFileId) return
          tree.leaveDraft(() => tree.onOpenFile(node))
        }}
        onRename={() => setMode("rename")}
        onDelete={() => setMode("delete")}
      />
    </li>
  )
}

function TreeRow({
  depth,
  label,
  kind,
  open,
  selected,
  unsaved,
  onOpen,
  onRename,
  onDelete,
}: {
  depth: number
  label: string
  kind: "dir" | "file"
  open?: boolean
  selected: boolean
  unsaved?: boolean
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const current = selected && kind === "file"
  const pinned = selected && kind === "dir"

  return (
    <div
      className={cn(
        "group relative flex w-full min-w-0 items-center rounded-md pr-1.5 transition-colors",
        current
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : pinned
            ? "bg-sidebar-accent/70 text-sidebar-foreground"
            : "text-sidebar-foreground/90 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
      )}
      style={{ paddingLeft: `${6 + depth * 14}px` }}
    >
      <button
        type="button"
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          (current || pinned) && "pr-12"
        )}
        aria-expanded={open}
        aria-current={current ? "true" : undefined}
        onClick={onOpen}
      >
        {kind === "dir" ? (
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
              open && "rotate-90 text-foreground"
            )}
          />
        ) : (
          <span className="size-3.5 shrink-0" />
        )}

        {kind === "file" ? (
          <FileText
            className={cn(
              "size-3.5 shrink-0",
              current ? "text-primary" : "text-muted-foreground"
            )}
          />
        ) : open ? (
          <FolderOpen className="size-3.5 shrink-0 text-foreground/80" />
        ) : (
          <Folder className="size-3.5 shrink-0 text-muted-foreground" />
        )}

        <span className="min-w-0 truncate">{label}</span>
        {kind === "file" ? (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            .typ
          </span>
        ) : null}

        {unsaved ? (
          <span
            className="ml-1 size-1.5 shrink-0 rounded-full bg-warning"
            title="有未保存修改"
            aria-label="有未保存修改"
          />
        ) : null}
      </button>

      {/* 操作图标胶囊 */}
      <div
        className={cn(
          "absolute right-1 flex items-center gap-0.5 rounded-md p-0.5 transition-all duration-150",
          current || pinned
            ? "pointer-events-auto bg-card/90 opacity-100 shadow-2xs"
            : "pointer-events-none bg-card/95 opacity-0 shadow-2xs group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
        )}
      >
        <button
          type="button"
          className="btn-pressable flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          title="重命名"
          aria-label={`重命名 ${label}`}
          onClick={(e) => {
            e.stopPropagation()
            onRename()
          }}
        >
          <Pencil className="size-3" />
        </button>
        <button
          type="button"
          className="btn-pressable flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
          title="删除"
          aria-label={`删除 ${label}`}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  )
}

function NameEntry({
  depth,
  placeholder,
  submitLabel,
  initial,
  file,
  onSubmit,
  onCancel,
}: {
  depth: number
  placeholder: string
  submitLabel: string
  initial?: string
  file?: boolean
  onSubmit: (name: string) => Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const stem = file ? fileStem(value) : value.trim()
  const ok = file ? validFileStem(value) : validSegment(value)

  return (
    <form
      className="animate-in fade-in-50 slide-in-from-left-1 duration-150 grid gap-1.5 py-1"
      style={{ paddingLeft: `${6 + depth * 14}px` }}
      onSubmit={(event) => {
        event.preventDefault()
        if (!ok || pending) {
          setError(segmentHint)
          return
        }
        setPending(true)
        setError(null)
        void onSubmit(stem)
          .catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : "操作失败")
          })
          .finally(() => setPending(false))
      }}
    >
      <input
        className={fieldClass}
        value={value}
        maxLength={file ? 68 : 64}
        autoFocus
        aria-label={placeholder}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onCancel()
          }
        }}
      />
      {error || (value.trim().length > 0 && !ok) ? (
        <p role="alert" className="text-xs leading-5 text-destructive">
          {error ?? segmentHint}
        </p>
      ) : null}
      <div className="flex gap-1">
        <Button type="submit" size="xs" disabled={pending || !ok}>
          {pending ? "正在保存" : submitLabel}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
        >
          取消
        </Button>
      </div>
    </form>
  )
}

function ConfirmDelete({
  label,
  note,
  onConfirm,
  onCancel,
}: {
  label: string
  note?: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="animate-in fade-in-50 duration-150 my-1 grid gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5">
      <p className="text-xs font-medium text-foreground">删除「{label}」？</p>
      {note ? (
        <p className="text-xs leading-5 text-muted-foreground">{note}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-1.5">
        <Button
          type="button"
          size="xs"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            setPending(true)
            setError(null)
            void onConfirm().catch((reason: unknown) => {
              setError(reason instanceof Error ? reason.message : "删除失败")
              setPending(false)
            })
          }}
        >
          {pending ? "正在删除" : "确认删除"}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  )
}
