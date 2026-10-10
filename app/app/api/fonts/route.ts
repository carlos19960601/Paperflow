import { NextResponse } from "next/server"

export const runtime = "nodejs"

const renderServiceUrl =
  process.env.RENDER_SERVICE_URL || "http://127.0.0.1:4000"

export async function GET() {
  try {
    const response = await fetch(`${renderServiceUrl}/api/fonts`, {
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    })
    return NextResponse.json(await response.json(), { status: response.status })
  } catch {
    return NextResponse.json(
      {
        code: "render_service_unavailable",
        message: "无法读取渲染服务的可用字体。",
      },
      { status: 503 },
    )
  }
}
