import { apiRequest } from "@/lib/api/client"
import type { TypstInputValue } from "@/lib/typst/inputs"

type GeneratePdfResponse = {
  filename: string
  contentBase64: string
}

export function generatePdf(
  name: string,
  params: Record<string, TypstInputValue>
) {
  return apiRequest<GeneratePdfResponse>("/pdf", {
    method: "POST",
    body: JSON.stringify({ name, params }),
  })
}

export function downloadPdf(filename: string, contentBase64: string) {
  const binary = atob(contentBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  const blob = new Blob([bytes], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename.toLowerCase().endsWith(".pdf")
    ? filename
    : `${filename}.pdf`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
