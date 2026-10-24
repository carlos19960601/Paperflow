import { isPathUnder } from "@/lib/org/files"
import type { TypstInputValue } from "@/lib/typst/inputs"

const storageKey = "paper-flow.input-values"

type StoredEntries = Record<string, Record<string, TypstInputValue>>

function readAll(): StoredEntries {
  if (typeof window === "undefined") {
    return {}
  }
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }
    const out: StoredEntries = {}
    for (const [path, record] of Object.entries(parsed)) {
      if (record && typeof record === "object" && !Array.isArray(record)) {
        out[path] = record as Record<string, TypstInputValue>
      }
    }
    return out
  } catch {
    return {}
  }
}

function writeAll(entries: StoredEntries) {
  if (typeof window === "undefined") return
  try {
    if (Object.keys(entries).length === 0) {
      window.localStorage.removeItem(storageKey)
      return
    }
    window.localStorage.setItem(storageKey, JSON.stringify(entries))
  } catch {
    // localStorage 容量不足时忽略持久化失败
  }
}

export function recallInputValues(
  path: string
): Record<string, TypstInputValue> | null {
  if (!path) return null
  return readAll()[path] ?? null
}

export function rememberInputValues(
  path: string,
  values: Record<string, TypstInputValue>
) {
  if (!path) return
  const all = readAll()
  if (Object.keys(values).length === 0) {
    delete all[path]
  } else {
    all[path] = values
  }
  writeAll(all)
}

export function forgetInputValues(path: string) {
  if (!path) return
  const all = readAll()
  if (!(path in all)) return
  delete all[path]
  writeAll(all)
}

export function forgetInputValuesTree(root: string) {
  if (!root) return
  const all = readAll()
  let changed = false
  for (const path of Object.keys(all)) {
    if (isPathUnder(path, root)) {
      delete all[path]
      changed = true
    }
  }
  if (changed) writeAll(all)
}

export function relocateInputValues(from: string, to: string) {
  if (!from || from === to) return
  const all = readAll()
  const next: StoredEntries = {}
  let changed = false
  for (const [path, values] of Object.entries(all)) {
    if (isPathUnder(path, from)) {
      const relocated = `${to}${path.slice(from.length)}`
      next[relocated] = values
      changed = true
    } else {
      next[path] = values
    }
  }
  if (changed) writeAll(next)
}
