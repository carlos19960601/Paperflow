/**
 * 运行时 API 基地址解析。
 *
 * 优先级：
 * 1. window.__BACKEND_URL__ — Docker 运行时由服务端 layout 注入
 * 2. NEXT_PUBLIC_API_URL — 本地开发时通过 .env 或构建时传入
 * 3. http://127.0.0.1:4000/api — 默认本地后端
 */

declare global {
  interface Window {
    __BACKEND_URL__?: string
  }
}

function resolveApiBaseUrl(): string {
  // 运行时注入（Docker 部署场景）
  if (typeof window !== "undefined" && window.__BACKEND_URL__) {
    return window.__BACKEND_URL__
  }

  // 构建时环境变量（本地开发场景）
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }

  // 默认本地后端
  return "http://127.0.0.1:4000/api"
}

/** 后端 API 基地址，末尾含 /api */
export const apiBaseUrl = resolveApiBaseUrl()

/** 后端服务地址（不含 /api 前缀），用于字体等非 API 静态资源 */
export const apiOrigin = apiBaseUrl.replace(/\/api\/?$/, "")