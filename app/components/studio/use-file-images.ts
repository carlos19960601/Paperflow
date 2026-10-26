"use client"

import { useEffect, useState } from "react"
import {
  deleteImage,
  getImageContent,
  listImages,
  renameImage,
  uploadImage,
} from "@/lib/api/images"

export type LoadedImage = {
  name: string
  sha256: string
  bytes: Uint8Array
  contentType: string
}

export type ImagePending =
  | { kind: "upload"; done: number; total: number }
  | { kind: "delete"; name: string }
  | { kind: "rename"; name: string }
  | null

type Phase = "idle" | "loading" | "ready" | "error"

export function useFileImages(path: string) {
  const [images, setImages] = useState<LoadedImage[]>([])
  const [phase, setPhase] = useState<Phase>(path ? "loading" : "idle")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<ImagePending>(null)
  const [activePath, setActivePath] = useState(path)
  if (activePath !== path) {
    setActivePath(path)
    setImages([])
    setError(null)
    setBusy(false)
    setPending(null)
    setPhase(path ? "loading" : "idle")
  }

  useEffect(() => {
    if (!path) {
      return
    }
    let cancelled = false
    void listImages(path)
      .then((items) =>
        Promise.all(
          items.map(async (item) => ({
            name: item.name,
            sha256: item.sha256,
            contentType: item.contentType,
            bytes: await getImageContent(path, item.name),
          }))
        )
      )
      .then((loaded) => {
        if (cancelled) return
        setImages(loaded); setPhase("ready")
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setImages([])
        setError(reason instanceof Error ? reason.message : "读取图片失败")
        setPhase("error")
      })
    return () => { cancelled = true }
  }, [path])

  async function upload(files: File[]) {
    if (!path || files.length === 0) return
    setBusy(true)
    setPending({ kind: "upload", done: 0, total: files.length })
    setError(null)
    const failures: string[] = []
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      if (!file) continue
      setPending({ kind: "upload", done: index, total: files.length })
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const saved = await uploadImage(path, file)
        setImages((current) => {
          const next = current.filter((image) => image.name !== saved.name)
          next.push({
            name: saved.name, sha256: saved.sha256,
            contentType: saved.contentType, bytes,
          })
          next.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
          return next
        })
        setPhase("ready")
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "上传图片失败"
        failures.push(`${file.name}：${message}`)
      }
    }
    setError(failures.length > 0 ? failures.join("；") : null)
    setBusy(false)
    setPending(null)
  }

  async function remove(name: string) {
    if (!path) return
    setBusy(true); setPending({ kind: "delete", name }); setError(null)
    try {
      await deleteImage(path, name)
      setImages((current) => current.filter((image) => image.name !== name))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除图片失败")
    } finally {
      setBusy(false); setPending(null)
    }
  }

  async function rename(name: string, newStem: string) {
    if (!path) return
    setBusy(true); setPending({ kind: "rename", name }); setError(null)
    try {
      const saved = await renameImage(path, name, newStem)
      setImages((current) => {
        const next = current.map((image) =>
          image.name === name
            ? {
                name: saved.name,
                sha256: saved.sha256,
                contentType: saved.contentType,
                bytes: image.bytes,
              }
            : image
        )
        next.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
        return next
      })
      return saved
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "重命名图片失败")
      throw reason
    } finally {
      setBusy(false); setPending(null)
    }
  }

  return { images, phase, error, busy, pending, upload, remove, rename }
}