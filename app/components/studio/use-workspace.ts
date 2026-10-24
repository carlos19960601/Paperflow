"use client"

import { useCallback, useEffect, useState } from "react"
import {
  createDirectory,
  deleteNode,
  listNodes,
  renameNode,
  saveFile,
} from "@/lib/api/nodes"
import type { TypstNode } from "@/lib/api/types"
import {
  isPathUnder,
  joinPath,
  parentPath,
  replacePathPrefix,
} from "@/lib/org/files"

export type LoadState = "idle" | "loading" | "ready" | "error"

export type NodeBucket = {
  state: LoadState
  error: string | null
  items: TypstNode[]
}

const emptyBucket: NodeBucket = { state: "idle", error: null, items: [] }

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "操作失败"
}

export function useWorkspace() {
  const [children, setChildren] = useState<Record<string, NodeBucket>>({
    "": { state: "loading", error: null, items: [] },
  })
  const [openPaths, setOpenPaths] = useState<string[]>([])

  const reload = useCallback(async (path: string) => {
    setChildren((current) => ({
      ...current,
      [path]: {
        state: "loading",
        error: null,
        items: current[path]?.items ?? [],
      },
    }))
    try {
      const items = await listNodes(path)
      setChildren((current) => ({
        ...current,
        [path]: { state: "ready", error: null, items },
      }))
    } catch (error) {
      setChildren((current) => ({
        ...current,
        [path]: {
          state: "error",
          error: messageOf(error),
          items: current[path]?.items ?? [],
        },
      }))
    }
  }, [])

  useEffect(() => { void reload("") }, [reload])

  function expand(path: string) {
    if (!path) return
    setOpenPaths((current) =>
      current.includes(path) ? current : [...current, path]
    )
    void reload(path)
  }

  function toggle(path: string) {
    const willOpen = !openPaths.includes(path)
    setOpenPaths((current) =>
      willOpen ? [...current, path] : current.filter((item) => item !== path)
    )
    if (willOpen) void reload(path)
  }

  async function addDirectory(parent: string, name: string) {
    const created = await createDirectory(joinPath(parent, name))
    if (parent) {
      setOpenPaths((current) =>
        current.includes(parent) ? current : [...current, parent]
      )
    }
    await reload(parent)
    setOpenPaths((current) =>
      current.includes(created.path) ? current : [...current, created.path]
    )
    setChildren((current) => ({
      ...current,
      [created.path]: current[created.path] ?? {
        state: "ready", error: null, items: [],
      },
    }))
    return created
  }

  async function addFile(parent: string, name: string, content: string) {
    const created = await saveFile(joinPath(parent, name), content)
    if (parent) {
      setOpenPaths((current) =>
        current.includes(parent) ? current : [...current, parent]
      )
    }
    await reload(parent)
    return created
  }

  async function rename(node: TypstNode, name: string) {
    const updated = await renameNode(node.path, name)
    if (updated.path === node.path) return updated
    if (node.kind === "dir") {
      setOpenPaths((current) =>
        current.map((path) => replacePathPrefix(path, node.path, updated.path))
      )
      setChildren((current) => {
        const next: Record<string, NodeBucket> = {}
        for (const [key, bucket] of Object.entries(current)) {
          next[replacePathPrefix(key, node.path, updated.path)] = {
            ...bucket,
            items: bucket.items.map((item) =>
              item.path === node.path
                ? { ...item, name: updated.name, path: updated.path }
                : { ...item, path: replacePathPrefix(item.path, node.path, updated.path) }
            ),
          }
        }
        return next
      })
      return updated
    }
    const parent = parentPath(node.path)
    setChildren((current) => {
      const bucket = current[parent] ?? emptyBucket
      return {
        ...current,
        [parent]: {
          ...bucket,
          items: bucket.items.map((item) =>
            item.path === node.path
              ? { ...item, name: updated.name, path: updated.path }
              : item
          ),
        },
      }
    })
    return updated
  }

  async function remove(node: TypstNode) {
    await deleteNode(node.path)
    setOpenPaths((current) =>
      current.filter((path) => !isPathUnder(path, node.path))
    )
    setChildren((current) => {
      const next: Record<string, NodeBucket> = {}
      for (const [key, bucket] of Object.entries(current)) {
        if (key !== "" && isPathUnder(key, node.path)) continue
        next[key] = {
          ...bucket,
          items: bucket.items.filter((item) => !isPathUnder(item.path, node.path)),
        }
      }
      return next
    })
  }

  return { children, openPaths, reload, expand, toggle, addDirectory, addFile, rename, remove }
}