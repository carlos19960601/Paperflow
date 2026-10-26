import { apiFetch, apiRequest } from "@/lib/api/client"

export type TypstImage = {
  name: string
  size: number
  contentType: string
  sha256: string
}

const maxImageBytes = 10 * 1024 * 1024 // 10MB

export function listImages(path: string) {
  return apiRequest<{ items: TypstImage[] | null }>(
    `/images?${new URLSearchParams({ path }).toString()}`
  ).then((res) => res.items ?? [])
}

export async function uploadImage(path: string, file: File) {
  if (file.size > maxImageBytes) {
    throw new Error("图片不能超过 10MB。")
  }
  const body = new FormData()
  body.set("path", path)
  body.set("file", file)
  return apiRequest<TypstImage>("/images", { method: "POST", body })
}

export async function getImageContent(path: string, name: string) {
  const response = await apiFetch(
    `/images/content?${new URLSearchParams({ path, name }).toString()}`,
    { headers: { Accept: "*/*" } }
  )
  return new Uint8Array(await response.arrayBuffer())
}

export function deleteImage(path: string, name: string) {
  return apiRequest<void>(
    `/images?${new URLSearchParams({ path, name }).toString()}`,
    { method: "DELETE" }
  )
}

export function renameImage(path: string, name: string, newName: string) {
  return apiRequest<TypstImage>("/images/rename", {
    method: "POST",
    body: JSON.stringify({ path, name, newName }),
  })
}