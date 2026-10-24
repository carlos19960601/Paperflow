import { apiKeepalive, apiRequest } from "@/lib/api/client"
import type { TypstFile, TypstNode } from "@/lib/api/types"

function withPath(base: string, path: string) {
  if (!path) {
    return base
  }
  return `${base}?${new URLSearchParams({ path }).toString()}`
}

export function listNodes(path = "") {
  return apiRequest<{ items: TypstNode[] | null }>(
    withPath("/nodes", path)
  ).then((res) => res.items ?? [])
}

export function createDirectory(path: string) {
  return apiRequest<TypstNode>("/directories", {
    method: "POST",
    body: JSON.stringify({ path }),
  })
}

export function getFile(path: string) {
  return apiRequest<TypstFile>(withPath("/files", path))
}

export function saveFile(path: string, content: string) {
  return apiRequest<TypstFile>("/files", {
    method: "PUT",
    body: JSON.stringify({ path, content }),
  })
}

export function saveFileKeepalive(path: string, content: string) {
  apiKeepalive("/files", JSON.stringify({ path, content }))
}

export function deleteNode(path: string) {
  return apiRequest<void>(withPath("/nodes", path), { method: "DELETE" })
}

export function renameNode(path: string, name: string) {
  return apiRequest<TypstNode>("/nodes/rename", {
    method: "POST",
    body: JSON.stringify({ path, name }),
  })
}