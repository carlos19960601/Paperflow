import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 30

const renderServiceUrl =
  process.env.RENDER_SERVICE_URL || "http://127.0.0.1:4000"

export async function POST(request: Request) {
  try {
    const response = await fetch(`${renderServiceUrl}/api/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await request.text(),
      signal: AbortSignal.timeout(25_000),
    })

    const body = await response.arrayBuffer()
    return new Response(body, {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") || "application/json",
        "content-disposition":
          response.headers.get("content-disposition")?.replace(
            "attachment",
            "inline",
          ) || 'inline; filename="document.pdf"',
      },
    })
  } catch {
    return NextResponse.json(
      {
        code: "render_service_unavailable",
        message: "PDF 渲染服务不可用，请确认 Rust 服务已在 4000 端口启动。",
      },
      { status: 503 },
    )
  }
}
