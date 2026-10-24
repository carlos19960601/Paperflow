import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "Paperflow · Typst 编辑器",
  description: "在线编写 Typst 源码，实时预览排版效果",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Docker 运行时注入：将 BACKEND_URL 写入 window.__BACKEND_URL__
  // 本地 dev / build 时不设置此变量，由 NEXT_PUBLIC_API_URL 生效
  const backendUrl = process.env.BACKEND_URL

  return (
    <html lang="zh-CN" suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}>
      <body>
        {backendUrl ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__BACKEND_URL__=${JSON.stringify(backendUrl)}`,
            }}
          />
        ) : null}
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}