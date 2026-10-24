import { isPathUnder } from "@/lib/org/files"

const storageKey = "paper-flow.drafts"

type StoredDraft = {
  path: string
  content: string
}

function readAll(): Record<string, StoredDraft> {
  if (typeof window === "undefined") {
    return {}
  }
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      return {}
    }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") {
      return {}
    }
    const result: Record<string, StoredDraft> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") {
        continue
      }
      const record = value as Record<string, unknown>
      if (typeof record.path === "string" && typeof record.content === "string") {
        result[key] = { path: record.path, content: record.content }
      }
    }
    return result
  } catch {
    return {}
  }
}

function writeAll(drafts: Record<string, StoredDraft>) {
  try {
    if (Object.keys(drafts).length === 0) {
      window.localStorage.removeItem(storageKey)
      return
    }
    window.localStorage.setItem(storageKey, JSON.stringify(drafts))
  } catch {
    // 配额满了就只靠随后的保存请求。
  }
}

export function rememberDraft(path: string, content: string) {
  if (!path) {
    return
  }
  const drafts = readAll()
  drafts[path] = { path, content }
  writeAll(drafts)
}

export function recallDraft(path: string): string | null {
  const draft = readAll()[path]
  return draft ? draft.content : null
}

export function forgetDraft(path: string) {
  if (!path) {
    return
  }
  const drafts = readAll()
  if (!drafts[path]) {
    return
  }
  delete drafts[path]
  writeAll(drafts)
}

export function forgetDraftTree(root: string) {
  if (!root) {
    return
  }
  const drafts = readAll()
  let changed = false
  for (const path of Object.keys(drafts)) {
    if (isPathUnder(path, root)) {
      delete drafts[path]
      changed = true
    }
  }
  if (changed) {
    writeAll(drafts)
  }
}

export function relocateDraft(from: string, to: string) {
  if (!from || from === to) {
    return
  }
  const drafts = readAll()
  const next: Record<string, StoredDraft> = {}
  let changed = false
  for (const [path, draft] of Object.entries(drafts)) {
    if (isPathUnder(path, from)) {
      const relocated = `${to}${path.slice(from.length)}`
      next[relocated] = { path: relocated, content: draft.content }
      changed = true
    } else {
      next[path] = draft
    }
  }
  if (changed) {
    writeAll(next)
  }
}