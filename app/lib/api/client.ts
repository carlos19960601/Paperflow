export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

import { apiBaseUrl, apiOrigin } from "./runtime-config"
export { apiBaseUrl, apiOrigin }

export async function apiFetch(path: string, init?: RequestInit) {
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData
  const headers = new Headers(init?.headers)
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
  })
  if (!response.ok) {
    let body: { code?: string; message?: string } = {}
    try {
      body = await response.json()
    } catch {
      // 非 JSON 响应体
    }
    throw new ApiError(
      response.status,
      body.code ?? "unknown",
      body.message ?? response.statusText
    )
  }
  return response
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init)
  if (response.status === 204) {
    return undefined as unknown as T
  }
  return response.json() as Promise<T>
}

export function apiKeepalive(path: string, body: string) {
  const url = `${apiBaseUrl}${path}`
  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    const blob = new Blob([body], { type: "application/json" })
    navigator.sendBeacon(url, blob)
  }
}
