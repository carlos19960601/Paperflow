// 字体数据来源：后端 /api/fonts（基于 fonts/ 目录扫描）。
// 保证前后端字体列表一致。

import { apiBaseUrl } from "@/lib/api/client"

let initialized = false
let initPromise: Promise<void> | null = null
let cachedFamilies: string[] = []
let cachedFiles: string[] = []
let cachedWeights: Record<string, string[]> = {}

/** 从后端 /api/fonts 加载字体数据，幂等。 */
export async function initFontData(): Promise<void> {
  if (initialized) return
  if (initPromise) return initPromise
  initPromise = (async () => {
    const resp = await fetch(`${apiBaseUrl}/fonts`)
    if (!resp.ok) throw new Error(`获取字体列表失败: ${resp.status}`)
    const data = await resp.json()
    cachedFiles = data.files as string[]
    cachedFamilies = data.families as string[]
    cachedWeights = (data.weights ?? {}) as Record<string, string[]>
    initialized = true
  })()
  return initPromise
}

/** 获取去重后的字体家族名列表（同步，需先调用 initFontData）。 */
export function fontFamilies(): string[] {
  return cachedFamilies
}

/** 获取字体文件名列表（同步，需先调用 initFontData）。 */
export function fontFiles(): string[] {
  return cachedFiles
}

/** 获取指定家族实际支持的 weight 列表（同步，需先调用 initFontData）。 */
export function fontWeights(family: string): string[] {
  return cachedWeights[family] ?? []
}

/** 常用字号列表（pt）。 */
export const fontSizes = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48]

/** 预设颜色列表。 */
export const presetColors = [
  { label: "黑", value: "black" },
  { label: "白", value: "white" },
  { label: "灰", value: "gray" },
  { label: "红", value: "red" },
  { label: "橙", value: "orange" },
  { label: "黄", value: "yellow" },
  { label: "绿", value: "green" },
  { label: "蓝", value: "blue" },
  { label: "紫", value: "purple" },
  { label: "粉", value: "pink" },
]